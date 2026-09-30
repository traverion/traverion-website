-- Phase 1798: earnings/ledger SELECT exclude viewers (Money PII / amounts).
-- CSV already finance/owner; SELECT stayed account-side so viewers could read
-- earnings rows and ledger via PostgREST.

drop policy if exists "Suppliers can view own earnings" on public.supplier_earnings;
create policy "Suppliers can view own earnings"
  on public.supplier_earnings for select
  using (public.is_supplier_account_export_actor(supplier_id));

drop policy if exists "Suppliers can view own ledger" on public.supplier_ledger_entries;
create policy "Suppliers can view own ledger"
  on public.supplier_ledger_entries for select
  using (public.is_supplier_account_export_actor(supplier_id));
