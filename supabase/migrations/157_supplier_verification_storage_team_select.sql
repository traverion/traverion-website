-- Phase 1214: supplier-verification storage SELECT for supplier team.
-- Paths are ownerId/... ; migration 029 only allowed starts_with(auth.uid()).
-- Team JWTs that can read owner supplier_profiles (154) must also open those files.
-- INSERT/UPDATE/DELETE stay owner-prefix only.

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
        and public.is_supplier_account_side(split_part(name, '/', 1)::uuid)
      )
    )
  );
