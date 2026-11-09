-- Orci — la passe automatique, et deux droits resserrés.
--
-- CHAQUE HEURE, la base appelle la fonction `expirations` : elle ferme les
-- accès arrivés à leur fin (sortie du groupe Telegram, retrait du dossier
-- Drive et des invitations Meet, WhatsApp marqué « à retirer ») et rejoue les
-- livraisons restées en erreur. Un Google momentanément injoignable ne laisse
-- donc personne sans son dossier plus d'une heure.
--
-- L'appel porte le secret que la base a généré elle-même
-- (`prive.reglages.cron_secret`). L'adresse des fonctions se pose une fois,
-- après la création du projet :
--   select public.definir_reglage('functions_url', 'https://<ref>.supabase.co/functions/v1');

-- Ces deux fonctions ne servent qu'aux politiques RLS du propriétaire. Postgres
-- les ouvre à PUBLIC par défaut : un visiteur anonyme n'a rien à leur demander.
revoke execute on function public.est_proprietaire() from public, anon;
revoke execute on function public.mon_formateur() from public, anon;
grant execute on function public.est_proprietaire() to authenticated;
grant execute on function public.mon_formateur() to authenticated;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function prive.passe_expirations() returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_url    text := (select valeur from prive.reglages where cle = 'functions_url');
  v_secret text := (select valeur from prive.reglages where cle = 'cron_secret');
begin
  if v_url is null or v_secret is null then
    raise warning 'Orci : functions_url ou cron_secret absent, passe ignorée';
    return null;
  end if;
  return net.http_post(
    url                  := rtrim(v_url, '/') || '/expirations',
    headers              := jsonb_build_object('Content-Type', 'application/json', 'x-orci-cron', v_secret),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end $$;

revoke all on function prive.passe_expirations() from public;

-- À la minute 17 : loin du haut de l'heure, où tous les crons du monde partent.
select cron.schedule('orci-expirations', '17 * * * *', 'select prive.passe_expirations()');
