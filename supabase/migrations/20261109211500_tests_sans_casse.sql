-- Orci — effacer les achats de test sans toucher à un accès payé pour de vrai.
--
-- Le cas : un acheteur a payé, puis le propriétaire refait un achat de test avec
-- le même numéro. L'accès pointe alors sur la commande de test ; l'effacer
-- emporterait un accès réellement acheté. Il est donc d'abord rendu à sa
-- dernière vraie commande, et seuls les accès nés d'un test sont supprimés.

create or replace function public.effacer_donnees_test() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  f uuid := public.mon_formateur();
  n integer;
begin
  if f is null then
    raise exception 'Réservé au propriétaire' using errcode = '42501';
  end if;

  update public.acces a
     set derniere_commande_id = (
           select c.id from public.commandes c
            where c.offre_id = a.offre_id and c.acheteur_id = a.acheteur_id
              and c.statut = 'paye' and not c.test
            order by c.payee_le desc nulls last
            limit 1)
   where exists (
           select 1 from public.commandes t
            where t.id = a.derniere_commande_id and t.test and t.formateur_id = f)
     and exists (
           select 1 from public.commandes c
            where c.offre_id = a.offre_id and c.acheteur_id = a.acheteur_id
              and c.statut = 'paye' and not c.test);

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
