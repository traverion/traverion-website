-- Phase 1224: supplier-verification storage write for supplier team under owner prefix.
-- SELECT already account-side (157). INSERT/UPDATE/DELETE were owner-uid prefix only.
-- Team uploads must land under ownerId/... so profile document paths stay consistent.

drop policy if exists "verification insert own" on storage.objects;
create policy "verification insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'supplier-verification'
    and (
      starts_with(name, auth.uid()::text || '/')
      or (
        split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
        and public.is_supplier_account_side(split_part(name, '/', 1)::uuid)
      )
    )
  );

drop policy if exists "verification update own" on storage.objects;
create policy "verification update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'supplier-verification'
    and (
      starts_with(name, auth.uid()::text || '/')
      or (
        split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
        and public.is_supplier_account_side(split_part(name, '/', 1)::uuid)
      )
    )
  )
  with check (
    bucket_id = 'supplier-verification'
    and (
      starts_with(name, auth.uid()::text || '/')
      or (
        split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
        and public.is_supplier_account_side(split_part(name, '/', 1)::uuid)
      )
    )
  );

drop policy if exists "verification delete own" on storage.objects;
create policy "verification delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'supplier-verification'
    and (
      starts_with(name, auth.uid()::text || '/')
      or (
        split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
        and public.is_supplier_account_side(split_part(name, '/', 1)::uuid)
      )
    )
  );
