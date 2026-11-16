-- Orci — le genre des séries (« Mystique », « Drame »…), pour les filtres et
-- les rangées de l'accueil. Facultatif : une série sans genre reste visible.

alter table public.series add column if not exists genre text
  check (genre is null or char_length(genre) between 2 and 30);

create or replace function public.catalogue() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', s.slug, 'titre', s.titre, 'synopsis', s.synopsis, 'genre', s.genre,
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
