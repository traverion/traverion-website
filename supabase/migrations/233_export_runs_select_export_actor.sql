-- Phase 1793: supplier_export_runs SELECT requires export actors (not viewers).
-- INSERT already locked (227/1765). Campaigns SELECT locked (1785). Viewers could
-- still read who exported guest-PII CSVs (actor, filters, counts).

drop policy if exists "Suppliers can read own export runs" on public.supplier_export_runs;
create policy "Suppliers can read own export runs"
  on public.supplier_export_runs
  for select
  using (public.is_supplier_account_export_actor(supplier_id));
