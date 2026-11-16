-- Orci — les mini-séries IA.
--
-- L'accueil devient un catalogue de séries. Une partie « gratuite » se regarde
-- librement ; les autres demandent un accès actif à l'offre Premium
-- (offres.series = true) : le même abonnement mensuel, payé en Mobile Money,
-- que les autres offres. Aucune série n'est créée ici : le propriétaire les
-- ajoute depuis son studio.
--
-- Les vidéos des parties dorment dans un seau PRIVÉ. La fonction `acces`
-- (action « episode ») vérifie le droit de regarder, puis rend un lien signé
-- valable quatre heures : un lien recopié dans un groupe meurt vite. Une partie
-- peut aussi pointer vers une vidéo YouTube (« youtube:<id> »), qui ne coûte
-- rien en bande passante mais se partage plus facilement.

alter table public.offres add column if not exists series boolean not null default false;

create table public.series (
  id            uuid primary key default gen_random_uuid(),
  formateur_id  uuid not null references public.formateurs(id) on delete cascade,
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  titre         text not null check (char_length(titre) between 1 and 80),
  synopsis      text check (synopsis is null or char_length(synopsis) <= 600),
  pochette_url  text,
  publiee       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.episodes (
  id          uuid primary key default gen_random_uuid(),
  serie_id    uuid not null references public.series(id) on delete cascade,
  numero      integer not null check (numero between 1 and 999),
  titre       text check (titre is null or char_length(titre) <= 80),
  -- « youtube:<id> », ou le chemin du fichier dans le seau privé « episodes ».
  video       text not null check (char_length(video) between 3 and 300),
  duree       integer check (duree is null or duree between 1 and 36000),   -- secondes
  gratuit     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (serie_id, numero)
);

create trigger maj before update on public.series   for each row execute function public.touche_maj();
create trigger maj before update on public.episodes for each row execute function public.touche_maj();

alter table public.series   enable row level security;
alter table public.episodes enable row level security;

-- Le public ne lit jamais ces tables directement : il passe par catalogue(),
-- qui ne dévoile pas où sont les vidéos.
create policy "proprietaire gere ses series" on public.series
  for all to authenticated
  using (formateur_id = public.mon_formateur())
  with check (formateur_id = public.mon_formateur());

create policy "proprietaire gere ses episodes" on public.episodes
  for all to authenticated
  using (exists (select 1 from public.series s where s.id = episodes.serie_id and s.formateur_id = public.mon_formateur()))
  with check (exists (select 1 from public.series s where s.id = episodes.serie_id and s.formateur_id = public.mon_formateur()));

grant select, insert, update, delete on public.series, public.episodes to authenticated;

-- ---------------------------------------------------------------------------
-- Le catalogue public : séries publiées, leurs parties (sans les vidéos), et
-- l'offre Premium qui ouvre la suite. La série qui a reçu une partie le plus
-- récemment passe devant.
-- ---------------------------------------------------------------------------

create or replace function public.catalogue() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', s.slug, 'titre', s.titre, 'synopsis', s.synopsis,
               'pochette_url', s.pochette_url, 'nouveaute', p.nouveaute,
               'parties', coalesce(p.parties, '[]'::jsonb)
             ) order by coalesce(p.nouveaute, s.created_at) desc)
        from public.series s
        left join lateral (
          select jsonb_agg(jsonb_build_object('numero', e.numero, 'titre', e.titre, 'duree', e.duree, 'gratuit', e.gratuit)
                           order by e.numero) as parties,
                 max(e.created_at) as nouveaute
            from public.episodes e
           where e.serie_id = s.id
        ) p on true
       where s.publiee
    ), '[]'::jsonb),
    'premium', (
      select jsonb_build_object('id', o.id, 'slug', o.slug, 'titre', o.titre, 'prix', o.prix,
                                'facturation', o.facturation, 'duree_jours', o.duree_jours)
        from public.offres o
       where o.publiee and o.series
       order by o.created_at
       limit 1
    ),
    'formateur', (
      select jsonb_build_object('nom', f.nom, 'whatsapp', f.whatsapp)
        from public.formateurs f
       order by f.created_at
       limit 1
    )
  )
$$;

grant execute on function public.catalogue() to anon, authenticated;

-- La page de vente et le paiement doivent savoir qu'une offre ouvre les séries.
-- Sans adresse précise, on ne tombe jamais sur le Premium.
create or replace function public.offre_publique(p_slug text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'slug', o.slug, 'titre', o.titre, 'sous_titre', o.sous_titre,
    'description', o.description, 'image_url', o.image_url,
    'prix', o.prix, 'prix_barre', o.prix_barre, 'devise', o.devise,
    'facturation', o.facturation, 'duree_jours', o.duree_jours,
    'programme', o.programme, 'bonus', o.bonus, 'infos', o.infos,
    'series', o.series,
    'formateur', jsonb_build_object('nom', f.nom, 'whatsapp', f.whatsapp),
    'outils', coalesce((
      select jsonb_agg(jsonb_build_object('type', t.type, 'titre', t.titre) order by t.ordre)
        from public.outils t where t.offre_id = o.id and t.actif
    ), '[]'::jsonb)
  )
  from public.offres o
  join public.formateurs f on f.id = o.formateur_id
  where o.publiee and (o.slug = p_slug or (p_slug is null and not o.series))
  order by o.created_at
  limit 1
$$;

grant execute on function public.offre_publique(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- L'abonnement Premium : 1 000 FCFA, 30 jours, renouvelé à chaque paiement.
-- Le prix se change ensuite depuis le studio (onglet Séries).
-- ---------------------------------------------------------------------------

insert into public.offres (formateur_id, slug, titre, sous_titre, prix, devise, facturation, duree_jours, publiee, series)
select f.id,
       'premium',
       'Premium · Mini-séries IA',
       'La suite de toutes les séries, dès leur sortie.',
       1000,
       coalesce((select o.devise from public.offres o where o.formateur_id = f.id order by o.created_at limit 1), 'XAF'),
       'mensuel',
       30,
       true,
       true
  from public.formateurs f
 order by f.created_at
 limit 1
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Les vidéos des parties : un seau privé, 50 Mo par fichier (le plafond du
-- plan gratuit). Seul le propriétaire y dépose, lit et retire ; les
-- spectateurs ne reçoivent que des liens signés.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('episodes', 'episodes', false, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "proprietaire depose des episodes" on storage.objects
  for insert to authenticated with check (bucket_id = 'episodes' and public.est_proprietaire());
create policy "proprietaire remplace ses episodes" on storage.objects
  for update to authenticated using (bucket_id = 'episodes' and public.est_proprietaire());
create policy "proprietaire lit ses episodes" on storage.objects
  for select to authenticated using (bucket_id = 'episodes' and public.est_proprietaire());
create policy "proprietaire supprime ses episodes" on storage.objects
  for delete to authenticated using (bucket_id = 'episodes' and public.est_proprietaire());
