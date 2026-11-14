-- Orci — la vidéo de présentation, importée depuis l'ordinateur du formateur.
--
-- Un seau à part : celui des images (medias) reste limité à 5 Mo d'images.
-- Ici, des vidéos jusqu'à 50 Mo, le plafond du plan gratuit de Supabase,
-- lisibles par tous (la page de vente les montre), déposées et retirées par le
-- seul propriétaire. La lecture lui est ouverte pour qu'il puisse retirer
-- l'ancienne vidéo quand il en importe une nouvelle.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "proprietaire depose des videos" on storage.objects
  for insert to authenticated with check (bucket_id = 'videos' and public.est_proprietaire());
create policy "proprietaire remplace ses videos" on storage.objects
  for update to authenticated using (bucket_id = 'videos' and public.est_proprietaire());
create policy "proprietaire lit ses videos" on storage.objects
  for select to authenticated using (bucket_id = 'videos' and public.est_proprietaire());
create policy "proprietaire supprime ses videos" on storage.objects
  for delete to authenticated using (bucket_id = 'videos' and public.est_proprietaire());
