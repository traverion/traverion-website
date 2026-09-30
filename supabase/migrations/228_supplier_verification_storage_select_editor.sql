-- Phase 1774: supplier-verification storage SELECT requires editor roles.
-- Writes already editor (224); finance/viewer must not open KYC docs via signed URLs.

drop policy if exists "verification read own" on storage.objects;
create policy "verification read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'supplier-verification'
    and (
      starts_with(name, auth.uid()::text || '/')
      or (
        split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
        and public.is_supplier_account_editor(split_part(name, '/', 1)::uuid)
      )
    )
  );
