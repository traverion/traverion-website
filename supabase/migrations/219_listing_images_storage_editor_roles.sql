-- Phase 1747: listing-images storage writes require editor roles
-- (owner/manager/ops), matching listings 1744. Finance/viewer keep read via
-- public SELECT policies unchanged.

drop policy if exists "Authenticated upload listing images own folder" on storage.objects;
create policy "Authenticated upload listing images own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-images'
    and (
      starts_with(name, auth.uid()::text || '/')
      or (
        split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
        and public.is_supplier_account_editor(split_part(name, '/', 1)::uuid)
      )
    )
  );

drop policy if exists "Authenticated update listing images own folder" on storage.objects;
create policy "Authenticated update listing images own folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'listing-images'
    and (
      starts_with(name, auth.uid()::text || '/')
      or (
        split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
        and public.is_supplier_account_editor(split_part(name, '/', 1)::uuid)
      )
    )
  )
  with check (
    bucket_id = 'listing-images'
    and (
      starts_with(name, auth.uid()::text || '/')
      or (
        split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
        and public.is_supplier_account_editor(split_part(name, '/', 1)::uuid)
      )
    )
  );

drop policy if exists "Authenticated delete listing images own folder" on storage.objects;
create policy "Authenticated delete listing images own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listing-images'
    and (
      starts_with(name, auth.uid()::text || '/')
      or (
        split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
        and public.is_supplier_account_editor(split_part(name, '/', 1)::uuid)
      )
    )
  );
