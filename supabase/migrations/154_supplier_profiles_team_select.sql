-- Phase 1202: supplier_profiles SELECT for supplier team.
-- Migration 051/097 left SELECT as auth.uid() = id; team JWTs need the
-- owner verification/payout status for publish and onboarding honesty.
-- Writes stay owner-only (existing UPDATE policies unchanged).

drop policy if exists "Owners can read own supplier profile" on public.supplier_profiles;
drop policy if exists "Suppliers can view own profile" on public.supplier_profiles;
create policy "Owners can read own supplier profile"
  on public.supplier_profiles
  for select
  using (public.is_supplier_account_side(id));
