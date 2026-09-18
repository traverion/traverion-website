-- Partner verification: re-assert private storage policies + approval/rejection email idempotency.

-- ---------------------------------------------------------------------------
-- Storage: own-folder only for supplier-verification (private bucket).
-- Policies match 029; re-applied so production cannot drift into "no INSERT policy".
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supplier-verification',
  'supplier-verification',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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

-- ---------------------------------------------------------------------------
-- Idempotency markers for staff decision emails (set by admin-supplier-verification).
-- ---------------------------------------------------------------------------
alter table public.supplier_profiles
  add column if not exists business_verified_email_sent_at timestamptz,
  add column if not exists business_rejected_email_sent_at timestamptz;

comment on column public.supplier_profiles.business_verified_email_sent_at is
  'When Traverion last emailed the supplier that business verification was approved. Used to avoid duplicate approval emails on admin retry.';
comment on column public.supplier_profiles.business_rejected_email_sent_at is
  'When Traverion last emailed the supplier that business verification was rejected. Cleared when staff re-approves.';
