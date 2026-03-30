-- Public business logo URL + Storage bucket for uploads.

alter table public.supplier_profiles
  add column if not exists business_logo_url text;

comment on column public.supplier_profiles.business_logo_url is
  'Public URL of business profile photo (Supabase Storage supplier-logos bucket).';

-- Bucket: public read so tour pages can show logos without signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supplier-logos',
  'supplier-logos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do nothing;

drop policy if exists "Public read supplier logos" on storage.objects;
create policy "Public read supplier logos"
  on storage.objects for select
  to public
  using (bucket_id = 'supplier-logos');

drop policy if exists "Authenticated upload supplier logos own folder" on storage.objects;
create policy "Authenticated upload supplier logos own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'supplier-logos'
    and starts_with(name, auth.uid()::text || '/')
  );

drop policy if exists "Authenticated update supplier logos own folder" on storage.objects;
create policy "Authenticated update supplier logos own folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'supplier-logos'
    and starts_with(name, auth.uid()::text || '/')
  )
  with check (
    bucket_id = 'supplier-logos'
    and starts_with(name, auth.uid()::text || '/')
  );

drop policy if exists "Authenticated delete supplier logos own folder" on storage.objects;
create policy "Authenticated delete supplier logos own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'supplier-logos'
    and starts_with(name, auth.uid()::text || '/')
  );
