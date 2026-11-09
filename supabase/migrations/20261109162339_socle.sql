-- Orci — le socle.
--
-- CE QU'EST ORCI EN V1. Une page de vente, un paiement Mobile Money, puis des
-- accès livrés AILLEURS : groupe Telegram, groupe WhatsApp, dossier Google Drive,
-- lives Google Meet. Orci ne stocke aucune vidéo et n'héberge aucune discussion :
-- il donne l'accès après le paiement, le retire quand il le faut, et compte.
--
-- UN SEUL FORMATEUR AU DÉPART : le propriétaire, pour sa propre formation. Le
-- schéma porte pourtant `formateur_id` partout, pour accueillir d'autres
-- formateurs plus tard sans migration de fond.
--
-- QUI LIT QUOI.
--   · Le navigateur d'un acheteur ne lit AUCUNE table : il passe par des
--     fonctions (`offre_publique`, `enregistrer_vue`) ou par les fonctions Edge,
--     qui tiennent le jeton secret de sa page « Mes accès ».
--   · Le propriétaire connecté lit ses données par RLS.
--   · Les fonctions Edge écrivent avec la clé service_role.
--   · Le schéma `prive` (jetons Google, secrets générés, codes Telegram) n'est
--     exposé par aucune API : seules des fonctions réservées à service_role y
--     touchent.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Utilitaires
-- ---------------------------------------------------------------------------

create or replace function public.touche_maj() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.formateurs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users(id) on delete set null,
  email       text,
  nom         text not null check (char_length(nom) between 2 and 80),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  -- Contact affiché sur la page de vente : chiffres seuls, indicatif compris.
  whatsapp    text check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.offres (
  id            uuid primary key default gen_random_uuid(),
  formateur_id  uuid not null references public.formateurs(id) on delete cascade,
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  titre         text not null check (char_length(titre) between 3 and 120),
  sous_titre    text check (sous_titre is null or char_length(sous_titre) <= 240),
  description   text check (description is null or char_length(description) <= 4000),
  image_url     text,
  -- LE PRIX VIT ICI ET NULLE PART AILLEURS. Le navigateur ne l'envoie jamais :
  -- la fonction de paiement le relit, sinon un `prix: 100` glissé dans la
  -- requête achèterait la formation à 100 FCFA.
  prix          integer not null check (prix between 100 and 10000000),
  prix_barre    integer check (prix_barre is null or prix_barre > 0),
  devise        text not null default 'XAF' check (devise in ('XAF', 'XOF')),
  facturation   text not null default 'unique' check (facturation in ('unique', 'mensuel')),
  -- null = accès à vie. Une offre mensuelle porte 30.
  duree_jours   integer check (duree_jours is null or duree_jours between 1 and 3650),
  programme     jsonb not null default '[]'::jsonb,   -- [{ "titre": "...", "texte": "..." }]
  bonus         jsonb not null default '[]'::jsonb,   -- ["...", "..."]
  infos         jsonb not null default '{}'::jsonb,   -- { "duree": "4 jours", "public": "..." }
  publiee       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint mensuel_a_une_duree check (facturation = 'unique' or duree_jours is not null)
);

-- Ce que l'acheteur reçoit, outil par outil. Un seul outil de chaque type par
-- offre en V1 : un groupe Telegram, un groupe WhatsApp, un dossier Drive, une
-- série de lives Meet, un lien libre.
create table public.outils (
  id          uuid primary key default gen_random_uuid(),
  offre_id    uuid not null references public.offres(id) on delete cascade,
  type        text not null check (type in ('telegram', 'whatsapp', 'drive', 'meet', 'lien')),
  titre       text not null check (char_length(titre) between 2 and 80),
  -- telegram : { chat_id, chat_titre }       whatsapp : { lien }
  -- drive    : { dossier_id, dossier_url }   lien     : { url }
  -- meet     : {} (les séances vivent dans `lives`)
  config      jsonb not null default '{}'::jsonb,
  actif       boolean not null default true,
  ordre       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (offre_id, type)
);

create table public.acheteurs (
  id           uuid primary key default gen_random_uuid(),
  -- Le numéro est l'identité de l'acheteur : c'est lui qui paie en Mobile Money
  -- et lui qu'on retrouve sur WhatsApp. Chiffres seuls, indicatif compris.
  telephone    text not null unique check (telephone ~ '^[0-9]{8,15}$'),
  nom          text not null check (char_length(nom) between 2 and 80),
  -- Adresse Google : sans elle, ni dossier Drive ni invitation Meet.
  email        text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telegram_id  bigint,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.commandes (
  id                     uuid primary key default gen_random_uuid(),
  reference              text not null unique,           -- la nôtre, ORC-…
  offre_id               uuid not null references public.offres(id),
  formateur_id           uuid not null references public.formateurs(id),
  acheteur_id            uuid not null references public.acheteurs(id),
  montant                integer not null check (montant > 0),
  -- Part d'Orci. Zéro tant que le propriétaire vend sa propre formation ; les
  -- 5 % s'appliqueront quand d'autres formateurs vendront.
  commission             integer not null default 0 check (commission >= 0),
  devise                 text not null default 'XAF',
  operateur              text,                           -- mtn, orange…
  fournisseur            text not null,                  -- simulation, nexuspay
  fournisseur_reference  text,
  statut                 text not null default 'en_cours'
                         check (statut in ('en_cours', 'paye', 'echec', 'annule', 'expire', 'rembourse')),
  source                 text,                           -- d'où vient l'acheteur
  -- Un paiement du mode test. Compté à part et effaçable d'un geste avant le
  -- lancement : il ne doit jamais gonfler un chiffre réel.
  test                   boolean not null default false,
  -- Réponses brutes du fournisseur : la seule pièce qui tranche entre « le
  -- client n'a pas validé » et « on a mal appelé l'API ».
  meta                   jsonb not null default '{}'::jsonb,
  payee_le               timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index commandes_formateur_idx on public.commandes (formateur_id, created_at desc);
create index commandes_fournisseur_ref_idx on public.commandes (fournisseur_reference);

create table public.acces (
  id                    uuid primary key default gen_random_uuid(),
  -- Le jeton de la page « Mes accès ». L'acheteur n'a pas de compte : ce lien
  -- secret EST son accès. 48 caractères hexadécimaux, impossible à deviner.
  jeton                 text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  offre_id              uuid not null references public.offres(id) on delete cascade,
  acheteur_id           uuid not null references public.acheteurs(id) on delete cascade,
  derniere_commande_id  uuid references public.commandes(id),
  debut                 timestamptz not null default now(),
  fin                   timestamptz,                     -- null = à vie
  statut                text not null default 'actif' check (statut in ('actif', 'expire', 'revoque')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- Un acheteur a UN accès par offre, prolongé à chaque paiement.
  unique (offre_id, acheteur_id)
);

create table public.livraisons (
  id          uuid primary key default gen_random_uuid(),
  acces_id    uuid not null references public.acces(id) on delete cascade,
  outil_id    uuid not null references public.outils(id) on delete cascade,
  -- a_faire   : l'accès n'est pas encore ouvert (lien Telegram pas encore créé,
  --             membre WhatsApp pas encore accepté, adresse Google manquante…)
  -- fait      : l'acheteur est dedans
  -- a_retirer : l'accès est fini, il faut le sortir (WhatsApp : à la main)
  -- retire    : il est sorti
  statut      text not null default 'a_faire' check (statut in ('a_faire', 'fait', 'a_retirer', 'retire', 'erreur')),
  -- telegram : { invite_link, user_id }   drive : { permission_id }
  -- meet     : { evenements: [...] }
  details     jsonb not null default '{}'::jsonb,
  erreur      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (acces_id, outil_id)
);

create index livraisons_invite_idx on public.livraisons ((details ->> 'invite_link'));

create table public.lives (
  id               uuid primary key default gen_random_uuid(),
  offre_id         uuid not null references public.offres(id) on delete cascade,
  titre            text not null check (char_length(titre) between 2 and 120),
  debut            timestamptz not null,
  duree_minutes    integer not null default 60 check (duree_minutes between 15 and 480),
  meet_url         text,
  google_event_id  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.vues (
  id          bigint generated always as identity primary key,
  offre_id    uuid not null references public.offres(id) on delete cascade,
  -- Empreinte anonyme tirée au hasard par le navigateur : elle compte les
  -- visiteurs uniques sans rien savoir d'eux.
  visiteur    text not null,
  source      text,
  created_at  timestamptz not null default now()
);

create index vues_offre_idx on public.vues (offre_id, created_at);

-- Déclencheurs de date de modification
create trigger maj before update on public.formateurs for each row execute function public.touche_maj();
create trigger maj before update on public.offres     for each row execute function public.touche_maj();
create trigger maj before update on public.outils     for each row execute function public.touche_maj();
create trigger maj before update on public.acheteurs  for each row execute function public.touche_maj();
create trigger maj before update on public.commandes  for each row execute function public.touche_maj();
create trigger maj before update on public.acces      for each row execute function public.touche_maj();
create trigger maj before update on public.livraisons for each row execute function public.touche_maj();
create trigger maj before update on public.lives      for each row execute function public.touche_maj();

-- ---------------------------------------------------------------------------
-- Schéma privé : rien ici n'est exposé par l'API
-- ---------------------------------------------------------------------------

create schema if not exists prive;
revoke all on schema prive from public, anon, authenticated;

-- Secrets générés par la base elle-même : aucun ne transite par un humain.
create table prive.reglages (
  cle         text primary key,
  valeur      text not null,
  updated_at  timestamptz not null default now()
);

insert into prive.reglages (cle, valeur) values
  ('cron_secret',     encode(extensions.gen_random_bytes(24), 'hex')),
  ('telegram_secret', encode(extensions.gen_random_bytes(24), 'hex')),
  ('etat_secret',     encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (cle) do nothing;

create table prive.google (
  formateur_id   uuid primary key references public.formateurs(id) on delete cascade,
  email          text,
  refresh_token  text not null,
  scopes         text,
  updated_at     timestamptz not null default now()
);

create table prive.telegram_codes (
  code       text primary key,
  outil_id   uuid not null references public.outils(id) on delete cascade,
  expire_le  timestamptz not null default now() + interval '2 hours'
);

-- ---------------------------------------------------------------------------
-- Qui est le propriétaire ?
-- ---------------------------------------------------------------------------

create or replace function public.mon_formateur() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.formateurs where user_id = auth.uid() limit 1
$$;

create or replace function public.est_proprietaire() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.formateurs where user_id = auth.uid())
$$;

-- Le premier compte qui se connecte devient propriétaire, une seule fois.
--
-- POURQUOI PAS UNE LISTE D'E-MAILS EN DUR. L'adresse de connexion du
-- propriétaire n'est pas connue à l'écriture de ce fichier. Si une adresse est
-- posée dans `formateurs.email`, seule elle peut revendiquer ; sinon le premier
-- arrivé l'emporte, et plus personne après lui. Il faut donc se connecter juste
-- après la mise en ligne.
create or replace function public.revendiquer_formateur() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  select id into v from public.formateurs where user_id = auth.uid();
  if v is not null then
    return v;
  end if;

  -- Une adresse réservée : elle seule peut prendre la place.
  update public.formateurs
     set user_id = auth.uid()
   where user_id is null
     and email is not null
     and lower(email) = lower(auth.email())
  returning id into v;
  if v is not null then
    return v;
  end if;

  -- Premier arrivé, à condition que personne n'ait encore revendiqué.
  if exists (select 1 from public.formateurs where user_id is not null) then
    return null;
  end if;

  update public.formateurs
     set user_id = auth.uid(), email = coalesce(email, auth.email())
   where id = (select id from public.formateurs where email is null order by created_at limit 1)
  returning id into v;

  return v;
end $$;

revoke all on function public.revendiquer_formateur() from public, anon;
grant execute on function public.revendiquer_formateur() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.formateurs enable row level security;
alter table public.offres     enable row level security;
alter table public.outils     enable row level security;
alter table public.acheteurs  enable row level security;
alter table public.commandes  enable row level security;
alter table public.acces      enable row level security;
alter table public.livraisons enable row level security;
alter table public.lives      enable row level security;
alter table public.vues       enable row level security;

create policy "proprietaire lit son profil" on public.formateurs
  for select to authenticated using (user_id = auth.uid());
create policy "proprietaire modifie son profil" on public.formateurs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "proprietaire gere ses offres" on public.offres
  for all to authenticated
  using (formateur_id = public.mon_formateur())
  with check (formateur_id = public.mon_formateur());

create policy "proprietaire gere ses outils" on public.outils
  for all to authenticated
  using (exists (select 1 from public.offres o where o.id = outils.offre_id and o.formateur_id = public.mon_formateur()))
  with check (exists (select 1 from public.offres o where o.id = outils.offre_id and o.formateur_id = public.mon_formateur()));

create policy "proprietaire gere ses lives" on public.lives
  for all to authenticated
  using (exists (select 1 from public.offres o where o.id = lives.offre_id and o.formateur_id = public.mon_formateur()))
  with check (exists (select 1 from public.offres o where o.id = lives.offre_id and o.formateur_id = public.mon_formateur()));

create policy "proprietaire lit ses acheteurs" on public.acheteurs
  for select to authenticated
  using (exists (select 1 from public.commandes c where c.acheteur_id = acheteurs.id and c.formateur_id = public.mon_formateur()));

create policy "proprietaire lit ses commandes" on public.commandes
  for select to authenticated using (formateur_id = public.mon_formateur());

create policy "proprietaire lit ses acces" on public.acces
  for select to authenticated
  using (exists (select 1 from public.offres o where o.id = acces.offre_id and o.formateur_id = public.mon_formateur()));

create policy "proprietaire lit ses livraisons" on public.livraisons
  for select to authenticated
  using (exists (
    select 1 from public.acces a join public.offres o on o.id = a.offre_id
     where a.id = livraisons.acces_id and o.formateur_id = public.mon_formateur()));

create policy "proprietaire lit ses vues" on public.vues
  for select to authenticated
  using (exists (select 1 from public.offres o where o.id = vues.offre_id and o.formateur_id = public.mon_formateur()));

-- Les visiteurs anonymes n'ont aucun droit direct sur les tables.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Ce que voit un visiteur
-- ---------------------------------------------------------------------------

-- La page de vente. Ne rend JAMAIS la configuration des outils (lien du groupe
-- WhatsApp, identifiant du groupe Telegram) : seulement leur type et leur titre.
create or replace function public.offre_publique(p_slug text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'slug', o.slug, 'titre', o.titre, 'sous_titre', o.sous_titre,
    'description', o.description, 'image_url', o.image_url,
    'prix', o.prix, 'prix_barre', o.prix_barre, 'devise', o.devise,
    'facturation', o.facturation, 'duree_jours', o.duree_jours,
    'programme', o.programme, 'bonus', o.bonus, 'infos', o.infos,
    'formateur', jsonb_build_object('nom', f.nom, 'whatsapp', f.whatsapp),
    'outils', coalesce((
      select jsonb_agg(jsonb_build_object('type', t.type, 'titre', t.titre) order by t.ordre)
        from public.outils t where t.offre_id = o.id and t.actif
    ), '[]'::jsonb)
  )
  from public.offres o
  join public.formateurs f on f.id = o.formateur_id
  where o.publiee and (p_slug is null or o.slug = p_slug)
  order by o.created_at
  limit 1
$$;

grant execute on function public.offre_publique(text) to anon, authenticated;

create or replace function public.enregistrer_vue(p_offre uuid, p_visiteur text, p_source text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_visiteur is null or char_length(p_visiteur) not between 8 and 64 then
    return;
  end if;
  if not exists (select 1 from public.offres where id = p_offre and publiee) then
    return;
  end if;
  -- Une vue par visiteur et par heure : recharger la page ne gonfle rien.
  if exists (
    select 1 from public.vues
     where offre_id = p_offre and visiteur = p_visiteur
       and created_at > now() - interval '1 hour'
  ) then
    return;
  end if;
  insert into public.vues (offre_id, visiteur, source)
  values (p_offre, p_visiteur, left(nullif(lower(trim(p_source)), ''), 60));
end $$;

grant execute on function public.enregistrer_vue(uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ce que font les fonctions Edge (service_role seulement)
-- ---------------------------------------------------------------------------

-- Ouvre ou prolonge l'accès d'une commande payée, et prépare une livraison par
-- outil. IDEMPOTENTE : un fournisseur relance ses notifications, et la même
-- commande ne doit jamais prolonger un abonnement deux fois.
create or replace function public.accorder_acces(p_commande uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  o record;
  v_acces uuid;
  v_derniere uuid;
begin
  select * into c from public.commandes where id = p_commande for update;
  if not found or c.statut <> 'paye' then
    return null;
  end if;
  select * into o from public.offres where id = c.offre_id;

  select id, derniere_commande_id into v_acces, v_derniere
    from public.acces
   where offre_id = c.offre_id and acheteur_id = c.acheteur_id
   for update;

  if v_acces is null then
    insert into public.acces (offre_id, acheteur_id, derniere_commande_id, fin)
    values (
      c.offre_id, c.acheteur_id, c.id,
      case when o.duree_jours is null then null else now() + make_interval(days => o.duree_jours) end
    )
    returning id into v_acces;
  elsif v_derniere is distinct from c.id then
    update public.acces a
       set derniere_commande_id = c.id,
           statut = 'actif',
           fin = case
                   when o.duree_jours is null then null
                   else greatest(coalesce(a.fin, now()), now()) + make_interval(days => o.duree_jours)
                 end
     where a.id = v_acces;
  end if;

  insert into public.livraisons as l (acces_id, outil_id, statut)
  select v_acces, t.id, case when t.type = 'lien' then 'fait' else 'a_faire' end
    from public.outils t
   where t.offre_id = c.offre_id and t.actif
  on conflict (acces_id, outil_id) do update
     set statut = case
                    when l.statut = 'a_retirer' then 'fait'     -- renouvelé avant d'avoir été sorti
                    when l.statut = 'retire' then 'a_faire'     -- revenu : tout est à refaire
                    else l.statut
                  end;

  return v_acces;
end $$;

revoke all on function public.accorder_acces(uuid) from public, anon, authenticated;

create or replace function public.reglage(p_cle text) returns text
language sql stable security definer set search_path = '' as $$
  select valeur from prive.reglages where cle = p_cle
$$;

create or replace function public.definir_reglage(p_cle text, p_valeur text) returns void
language sql security definer set search_path = '' as $$
  insert into prive.reglages (cle, valeur) values (p_cle, p_valeur)
  on conflict (cle) do update set valeur = excluded.valeur, updated_at = now()
$$;

create or replace function public.oublier_reglage(p_cle text) returns void
language sql security definer set search_path = '' as $$
  delete from prive.reglages where cle = p_cle
$$;

create or replace function public.google_jeton(p_formateur uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('email', email, 'refresh_token', refresh_token, 'scopes', scopes)
    from prive.google where formateur_id = p_formateur
$$;

create or replace function public.google_enregistrer(p_formateur uuid, p_email text, p_refresh text, p_scopes text) returns void
language sql security definer set search_path = '' as $$
  insert into prive.google (formateur_id, email, refresh_token, scopes)
  values (p_formateur, p_email, p_refresh, p_scopes)
  on conflict (formateur_id) do update
    set email = excluded.email, refresh_token = excluded.refresh_token,
        scopes = excluded.scopes, updated_at = now()
$$;

create or replace function public.google_oublier(p_formateur uuid) returns void
language sql security definer set search_path = '' as $$
  delete from prive.google where formateur_id = p_formateur
$$;

create or replace function public.telegram_creer_code(p_outil uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v text := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
begin
  delete from prive.telegram_codes where outil_id = p_outil or expire_le < now();
  insert into prive.telegram_codes (code, outil_id) values (v, p_outil);
  return v;
end $$;

create or replace function public.telegram_utiliser_code(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v uuid;
begin
  delete from prive.telegram_codes
   where code = upper(trim(p_code)) and expire_le > now()
  returning outil_id into v;
  return v;
end $$;

revoke all on function public.reglage(text)                                  from public, anon, authenticated;
revoke all on function public.definir_reglage(text, text)                    from public, anon, authenticated;
revoke all on function public.oublier_reglage(text)                          from public, anon, authenticated;
revoke all on function public.google_jeton(uuid)                             from public, anon, authenticated;
revoke all on function public.google_enregistrer(uuid, text, text, text)     from public, anon, authenticated;
revoke all on function public.google_oublier(uuid)                           from public, anon, authenticated;
revoke all on function public.telegram_creer_code(uuid)                      from public, anon, authenticated;
revoke all on function public.telegram_utiliser_code(text)                   from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ce que voit le propriétaire
-- ---------------------------------------------------------------------------

-- Les chiffres du tableau de bord, en heure de Douala : un jour commence à
-- minuit au Cameroun, pas à minuit UTC.
create or replace function public.stats_tableau(p_jours integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  f uuid := public.mon_formateur();
  n integer := least(greatest(coalesce(p_jours, 30), 1), 365);
  j0 date := (now() at time zone 'Africa/Douala')::date - (n - 1);
  r jsonb;
begin
  if f is null then
    raise exception 'Réservé au propriétaire' using errcode = '42501';
  end if;

  with
  mes_offres as (select id from public.offres where formateur_id = f),
  v as (
    select visiteur, source, (created_at at time zone 'Africa/Douala')::date as jour
      from public.vues
     where offre_id in (select id from mes_offres)
       and (created_at at time zone 'Africa/Douala')::date >= j0
  ),
  c as (
    select statut, montant, source, test,
           (created_at at time zone 'Africa/Douala')::date as jour,
           (payee_le at time zone 'Africa/Douala')::date as jour_paye
      from public.commandes
     where formateur_id = f
       and (created_at at time zone 'Africa/Douala')::date >= j0
  ),
  jours as (select generate_series(j0, (now() at time zone 'Africa/Douala')::date, interval '1 day')::date as jour),
  src as (
    select coalesce(s.source, 'direct') as source,
           coalesce(max(s.visiteurs), 0) as visiteurs,
           coalesce(max(s.ventes), 0) as ventes,
           coalesce(max(s.revenu), 0) as revenu
      from (
        select source, count(distinct visiteur) as visiteurs, 0::bigint as ventes, 0::bigint as revenu from v group by source
        union all
        select source, 0::bigint, count(*), sum(montant)::bigint from c where statut = 'paye' group by source
      ) s
     group by coalesce(s.source, 'direct')
  )
  select jsonb_build_object(
    'jours', n,
    'visiteurs', (select count(distinct visiteur) from v),
    'vues', (select count(*) from v),
    'tentatives', (select count(*) from c),
    'ventes', (select count(*) from c where statut = 'paye'),
    'ventes_test', (select count(*) from c where statut = 'paye' and test),
    'revenu', (select coalesce(sum(montant), 0) from c where statut = 'paye'),
    'revenu_test', (select coalesce(sum(montant), 0) from c where statut = 'paye' and test),
    'membres_actifs', (select count(*) from public.acces where offre_id in (select id from mes_offres) and statut = 'actif'),
    'membres_finis', (select count(*) from public.acces where offre_id in (select id from mes_offres) and statut <> 'actif'),
    'serie', (
      select jsonb_agg(jsonb_build_object(
               'jour', jr.jour,
               'visiteurs', (select count(distinct visiteur) from v where v.jour = jr.jour),
               'ventes', (select count(*) from c where c.statut = 'paye' and c.jour_paye = jr.jour),
               'revenu', (select coalesce(sum(montant), 0) from c where c.statut = 'paye' and c.jour_paye = jr.jour)
             ) order by jr.jour)
        from jours jr
    ),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('source', source, 'visiteurs', visiteurs, 'ventes', ventes, 'revenu', revenu)
                       order by ventes desc, visiteurs desc)
        from src
    ), '[]'::jsonb),
    'a_faire', jsonb_build_object(
      'whatsapp_a_valider', (
        select count(*) from public.livraisons l
          join public.outils t on t.id = l.outil_id
          join public.acces a on a.id = l.acces_id
         where t.type = 'whatsapp' and l.statut = 'a_faire' and a.statut = 'actif'
           and a.offre_id in (select id from mes_offres)),
      'whatsapp_a_retirer', (
        select count(*) from public.livraisons l
          join public.outils t on t.id = l.outil_id
          join public.acces a on a.id = l.acces_id
         where t.type = 'whatsapp' and l.statut = 'a_retirer'
           and a.offre_id in (select id from mes_offres)),
      'erreurs', (
        select count(*) from public.livraisons l
          join public.acces a on a.id = l.acces_id
         where l.statut = 'erreur' and a.offre_id in (select id from mes_offres))
    )
  ) into r;

  return r;
end $$;

revoke all on function public.stats_tableau(integer) from public, anon;
grant execute on function public.stats_tableau(integer) to authenticated;

-- Les acheteurs, avec l'état de chaque accès, et les paiements restés en route
-- (à relancer sur WhatsApp : c'est souvent là que dort la moitié des ventes).
create or replace function public.liste_acheteurs() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  f uuid := public.mon_formateur();
begin
  if f is null then
    raise exception 'Réservé au propriétaire' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'membres', coalesce((
      select jsonb_agg(m order by m.depuis desc)
        from (
          select a.id, a.jeton, a.statut, a.debut as depuis, a.fin,
                 o.titre as offre,
                 jsonb_build_object('id', b.id, 'nom', b.nom, 'telephone', b.telephone,
                                    'email', b.email, 'telegram', b.telegram_id is not null) as acheteur,
                 (select jsonb_build_object('reference', c.reference, 'montant', c.montant,
                                            'payee_le', c.payee_le, 'test', c.test, 'source', c.source)
                    from public.commandes c where c.id = a.derniere_commande_id) as commande,
                 coalesce((
                   select jsonb_agg(jsonb_build_object('id', l.id, 'type', t.type, 'statut', l.statut, 'erreur', l.erreur)
                                    order by t.ordre)
                     from public.livraisons l join public.outils t on t.id = l.outil_id
                    where l.acces_id = a.id
                 ), '[]'::jsonb) as livraisons
            from public.acces a
            join public.acheteurs b on b.id = a.acheteur_id
            join public.offres o on o.id = a.offre_id
           where o.formateur_id = f
        ) m
    ), '[]'::jsonb),
    'relances', coalesce((
      select jsonb_agg(r order by r.le desc)
        from (
          select c.reference, c.statut, c.montant, c.created_at as le, c.test,
                 o.titre as offre, b.nom, b.telephone
            from public.commandes c
            join public.acheteurs b on b.id = c.acheteur_id
            join public.offres o on o.id = c.offre_id
           where c.formateur_id = f
             and c.statut in ('en_cours', 'echec', 'annule', 'expire')
             and c.created_at > now() - interval '30 days'
             and c.created_at < now() - interval '10 minutes'
             and not exists (
               select 1 from public.acces a
                where a.offre_id = c.offre_id and a.acheteur_id = c.acheteur_id and a.statut = 'actif')
           order by c.created_at desc
           limit 100
        ) r
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.liste_acheteurs() from public, anon;
grant execute on function public.liste_acheteurs() to authenticated;

-- WhatsApp n'a pas d'API utilisable pour les groupes : c'est le propriétaire qui
-- accepte et qui sort les membres, puis le note ici.
create or replace function public.marquer_livraison(p_livraison uuid, p_statut text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_statut not in ('fait', 'retire', 'a_faire') then
    raise exception 'Statut refusé : %', p_statut using errcode = '22023';
  end if;

  update public.livraisons l
     set statut = p_statut, erreur = null
    from public.acces a
    join public.offres o on o.id = a.offre_id
   where l.id = p_livraison
     and a.id = l.acces_id
     and o.formateur_id = public.mon_formateur();

  if not found then
    raise exception 'Livraison introuvable' using errcode = '42501';
  end if;
end $$;

revoke all on function public.marquer_livraison(uuid, text) from public, anon;
grant execute on function public.marquer_livraison(uuid, text) to authenticated;

-- Avant le lancement : effacer tout ce que le mode test a produit.
create or replace function public.effacer_donnees_test() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  f uuid := public.mon_formateur();
  n integer;
begin
  if f is null then
    raise exception 'Réservé au propriétaire' using errcode = '42501';
  end if;

  delete from public.acces a
   using public.commandes c
   where c.id = a.derniere_commande_id and c.test and c.formateur_id = f;

  delete from public.commandes where test and formateur_id = f;
  get diagnostics n = row_count;

  delete from public.acheteurs b
   where not exists (select 1 from public.commandes c where c.acheteur_id = b.id);

  return n;
end $$;

revoke all on function public.effacer_donnees_test() from public, anon;
grant execute on function public.effacer_donnees_test() to authenticated;

-- ---------------------------------------------------------------------------
-- Images des offres
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('medias', 'medias', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "proprietaire depose des medias" on storage.objects
  for insert to authenticated with check (bucket_id = 'medias' and public.est_proprietaire());
create policy "proprietaire remplace ses medias" on storage.objects
  for update to authenticated using (bucket_id = 'medias' and public.est_proprietaire());
create policy "proprietaire supprime ses medias" on storage.objects
  for delete to authenticated using (bucket_id = 'medias' and public.est_proprietaire());
