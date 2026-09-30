-- Phase 1785: campaigns/ops-notes/vouchers SELECT require editor roles.
-- Writes already editor-locked; guest emails / notes / voucher codes must not leak to viewers.

drop policy if exists "Suppliers can read own message campaigns" on public.supplier_message_campaigns;
create policy "Suppliers can read own message campaigns"
  on public.supplier_message_campaigns
  for select
  using (public.is_supplier_account_editor(supplier_id));

drop policy if exists "Suppliers can read own booking notes" on public.supplier_booking_ops_notes;
create policy "Suppliers can read own booking notes"
  on public.supplier_booking_ops_notes
  for select
  using (public.is_supplier_account_editor(supplier_id));

drop policy if exists "Suppliers can read own vouchers" on public.supplier_booking_vouchers;
create policy "Suppliers can read own vouchers"
  on public.supplier_booking_vouchers
  for select
  using (public.is_supplier_account_editor(supplier_id));
