-- Private storage paths for ID and company registration proof (not public URLs).

alter table public.supplier_profiles
  add column if not exists identity_document_path text,
  add column if not exists company_registration_document_path text;

comment on column public.supplier_profiles.identity_document_path is
  'Storage path in supplier-verification bucket (e.g. userId/identity-document.pdf).';
comment on column public.supplier_profiles.company_registration_document_path is
  'Storage path for company extract / registration proof (company suppliers).';

-- Private bucket: only owner can read/write; Traverion reviews via Dashboard or service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supplier-verification',
  'supplier-verification',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do nothing;

drop policy if exists "verification read own" on storage.objects;
create policy "verification read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'supplier-verification'
    and starts_with(name, auth.uid()::text || '/')
  );

drop policy if exists "verification insert own" on storage.objects;
create policy "verification insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'supplier-verification'
    and starts_with(name, auth.uid()::text || '/')
  );

drop policy if exists "verification update own" on storage.objects;
create policy "verification update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'supplier-verification'
    and starts_with(name, auth.uid()::text || '/')
  )
  with check (
    bucket_id = 'supplier-verification'
    and starts_with(name, auth.uid()::text || '/')
  );

drop policy if exists "verification delete own" on storage.objects;
create policy "verification delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'supplier-verification'
    and starts_with(name, auth.uid()::text || '/')
  );
