-- Phase 1218: supplier-logos storage write for supplier team under owner prefix.
-- Public SELECT unchanged. Paths are ownerId/business-logo.*; team JWTs need
-- insert/update/delete when the path prefix is their account-side supplier id.

drop policy if exists "Authenticated upload supplier logos own folder" on storage.objects;
create policy "Authenticated upload supplier logos own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'supplier-logos'
    and (
      starts_with(name, auth.uid()::text || '/')
      or (
        split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
        and public.is_supplier_account_side(split_part(name, '/', 1)::uuid)
      )
    )
  );

drop policy if exists "Authenticated update supplier logos own folder" on storage.objects;
create policy "Authenticated update supplier logos own folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'supplier-logos'
    and (
      starts_with(name, auth.uid()::text || '/')
      or (
        split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
        and public.is_supplier_account_side(split_part(name, '/', 1)::uuid)
      )
    )
  )
  with check (
    bucket_id = 'supplier-logos'
    and (
      starts_with(name, auth.uid()::text || '/')
      or (
        split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
        and public.is_supplier_account_side(split_part(name, '/', 1)::uuid)
      )
    )
  );

drop policy if exists "Authenticated delete supplier logos own folder" on storage.objects;
create policy "Authenticated delete supplier logos own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'supplier-logos'
    and (
      starts_with(name, auth.uid()::text || '/')
      or (
        split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
        and public.is_supplier_account_side(split_part(name, '/', 1)::uuid)
      )
    )
  );
