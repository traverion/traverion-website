-- Public bucket for listing hero + gallery photos (supplier uploads; guests read on tour pages).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-images',
  'listing-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do nothing;

drop policy if exists "Public read listing images" on storage.objects;
create policy "Public read listing images"
  on storage.objects for select
  to public
  using (bucket_id = 'listing-images');

drop policy if exists "Authenticated upload listing images own folder" on storage.objects;
create policy "Authenticated upload listing images own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-images'
    and starts_with(name, auth.uid()::text || '/')
  );

drop policy if exists "Authenticated update listing images own folder" on storage.objects;
create policy "Authenticated update listing images own folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'listing-images'
    and starts_with(name, auth.uid()::text || '/')
  )
  with check (
    bucket_id = 'listing-images'
    and starts_with(name, auth.uid()::text || '/')
  );

drop policy if exists "Authenticated delete listing images own folder" on storage.objects;
create policy "Authenticated delete listing images own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listing-images'
    and starts_with(name, auth.uid()::text || '/')
  );
