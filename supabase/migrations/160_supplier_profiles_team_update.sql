-- Phase 1219: supplier_profiles UPDATE for supplier team.
-- SELECT already account-side (154); logo/settings writes still used auth.uid() = id.
-- Verification lock trigger (083/088) still blocks self-grant of verified/rejected.

drop policy if exists "Users can update own profile" on public.supplier_profiles;
create policy "Users can update own profile"
  on public.supplier_profiles
  for update
  using (public.is_supplier_account_side(id))
  with check (public.is_supplier_account_side(id));
