-- Phase 1144: team SELECT on supplier_earnings and supplier_ledger_entries
-- (parity with is_supplier_account_side from 141). Client also resolves owner id.

drop policy if exists "Suppliers can view own earnings" on public.supplier_earnings;
create policy "Suppliers can view own earnings"
  on public.supplier_earnings for select
  using (public.is_supplier_account_side(supplier_id));

drop policy if exists "Suppliers can view own ledger" on public.supplier_ledger_entries;
create policy "Suppliers can view own ledger"
  on public.supplier_ledger_entries for select
  using (public.is_supplier_account_side(supplier_id));
