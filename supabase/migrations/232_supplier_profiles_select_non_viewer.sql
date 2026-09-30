-- Phase 1790: supplier_profiles SELECT exclude viewers (IBAN/tax/KYC paths).
-- Writes already editor-locked (224). SELECT stayed account-side — viewers could
-- read payout_iban, tax_id, identity_document_path via PostgREST.
-- Reuse is_supplier_account_export_actor: owner/manager/ops/finance (not viewer).

drop policy if exists "Owners can read own supplier profile" on public.supplier_profiles;
drop policy if exists "Suppliers can view own profile" on public.supplier_profiles;
create policy "Owners can read own supplier profile"
  on public.supplier_profiles
  for select
  using (public.is_supplier_account_export_actor(id));
