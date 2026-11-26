-- Orci — les comptes des spectateurs (Firebase Authentication : Google, ou
-- e-mail et mot de passe). La connexion elle-même vit chez Firebase ; la base
-- garde qui s'est inscrit, et relie un achat Premium au compte qui l'a payé :
-- en se connectant sur un autre téléphone, on retrouve son Premium.
--
-- Les fonctions Edge vérifient le jeton Firebase avant toute écriture ici.

create table public.spectateurs (
  uid         text primary key check (char_length(uid) between 1 and 128),
  email       text check (email is null or char_length(email) <= 254),
  nom         text check (nom is null or char_length(nom) <= 80),
  fournisseur text check (fournisseur is null or char_length(fournisseur) <= 40),   -- google.com, password
  created_at  timestamptz not null default now(),
  vu_le       timestamptz not null default now()
);

alter table public.spectateurs enable row level security;

create policy "proprietaire lit les spectateurs" on public.spectateurs
  for select to authenticated using (public.est_proprietaire());

grant select on public.spectateurs to authenticated;

-- Un achat appartient au compte qui l'a payé (ou qui a ouvert son lien d'accès
-- en premier). Plusieurs numéros peuvent mener au même compte.
alter table public.acheteurs add column if not exists compte text references public.spectateurs(uid) on delete set null;
create index if not exists acheteurs_compte_idx on public.acheteurs (compte) where compte is not null;

-- Pour le studio : combien de comptes, et combien cette semaine.
create or replace function public.stats_spectateurs() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.est_proprietaire() then jsonb_build_object(
    'total', (select count(*) from public.spectateurs),
    'semaine', (select count(*) from public.spectateurs where created_at > now() - interval '7 days')
  ) end
$$;

revoke all on function public.stats_spectateurs() from public, anon;
grant execute on function public.stats_spectateurs() to authenticated;
