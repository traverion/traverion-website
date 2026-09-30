-- Phase 1754: supplier_profiles UPDATE + supplier-verification storage writes require editor roles.
-- Finance/viewer remain account-side for SELECT; cannot mutate KYC, payout, or guest legal copy.

drop policy if exists "Users can update own profile" on public.supplier_profiles;
create policy "Users can update own profile"
  on public.supplier_profiles
  for update
  using (public.is_supplier_account_editor(id))
  with check (public.is_supplier_account_editor(id));

comment on policy "Users can update own profile" on public.supplier_profiles is
  'Phase 1754: profile writes require owner/manager/ops; finance/viewer read-only.';

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
        and public.is_supplier_account_editor(split_part(name, '/', 1)::uuid)
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
        and public.is_supplier_account_editor(split_part(name, '/', 1)::uuid)
      )
    )
  )
  with check (
    bucket_id = 'supplier-verification'
    and (
      starts_with(name, auth.uid()::text || '/')
      or (
        split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
        and public.is_supplier_account_editor(split_part(name, '/', 1)::uuid)
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
        and public.is_supplier_account_editor(split_part(name, '/', 1)::uuid)
      )
    )
  );
