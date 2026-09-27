-- Phase 1196: team SELECT on supplier message campaigns and export runs
-- (144 already granted team INSERT/UPDATE; SELECT stayed owner-only in 019).

drop policy if exists "Suppliers can read own message campaigns" on public.supplier_message_campaigns;
create policy "Suppliers can read own message campaigns"
  on public.supplier_message_campaigns
  for select
  using (public.is_supplier_account_side(supplier_id));

drop policy if exists "Suppliers can read own export runs" on public.supplier_export_runs;
create policy "Suppliers can read own export runs"
  on public.supplier_export_runs
  for select
  using (public.is_supplier_account_side(supplier_id));
