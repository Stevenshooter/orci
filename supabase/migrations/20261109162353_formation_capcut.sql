-- La première offre : la formation CapCut Pro de Motivation Family, reprise de
-- la page de vente qui vivait dans Sellio (formation-capcut/index.html).
-- Tout est modifiable depuis l'espace admin : ce n'est qu'un point de départ.

insert into public.formateurs (nom, slug, whatsapp)
values ('Motivation Family', 'motivation-family', '237681514802')
on conflict (slug) do nothing;

insert into public.offres (
  formateur_id, slug, titre, sous_titre, description, prix, prix_barre,
  facturation, duree_jours, programme, bonus, infos, publiee
)
select
  f.id,
  'capcut-pro',
  'Formation Montage Vidéo CapCut Pro',
  'Apprends à monter des vidéos professionnelles depuis chez toi.',
  'En 4 jours, tu passes de zéro à des montages propres pour TikTok, YouTube et tes clients : coupe, transitions, titres animés, son, effets et export en haute qualité.',
  15000,
  20000,
  'unique',
  null,
  '[
    {"titre": "Introduction à CapCut Pro", "texte": "Découvrir l''interface et les outils essentiels."},
    {"titre": "Montage de base", "texte": "Couper, assembler, ajuster les clips et ajouter des transitions."},
    {"titre": "Textes et titrages", "texte": "Créer des titres animés et des sous-titres dynamiques."},
    {"titre": "Audio et effets sonores", "texte": "Ajouter de la musique, des effets et régler le son."},
    {"titre": "Effets visuels et filtres", "texte": "Appliquer des effets, filtres et animations professionnelles."},
    {"titre": "Exportation et partage", "texte": "Exporter en haute qualité et partager sur les réseaux sociaux."}
  ]'::jsonb,
  '[
    "Pack d''effets, transitions et sons exclusifs",
    "Modèles de projets prêts à l''emploi",
    "Conseils pour gagner de l''argent avec le montage vidéo",
    "Accès à un groupe d''entraide privé"
  ]'::jsonb,
  '{"duree": "4 jours", "public": "Ouvert aux débutants comme aux pros."}'::jsonb,
  true
from public.formateurs f
where f.slug = 'motivation-family'
on conflict (slug) do nothing;

insert into public.outils (offre_id, type, titre, ordre)
select o.id, x.type, x.titre, x.ordre
  from public.offres o
 cross join (values
   ('drive',    'Les vidéos et fichiers de la formation', 1),
   ('meet',     'Les lives sur Google Meet',              2),
   ('telegram', 'Le groupe Telegram de la formation',     3),
   ('whatsapp', 'Le groupe d''entraide WhatsApp',         4)
 ) as x(type, titre, ordre)
 where o.slug = 'capcut-pro'
on conflict (offre_id, type) do nothing;
