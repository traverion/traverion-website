-- Phase 1799: booking events/messages SELECT require editors.
-- Writes already editor-locked (222); SELECT stayed account-side — viewers could
-- read outbound recipient arrays (guest emails) on supplier_booking_messages.

drop policy if exists "Suppliers can read own booking events" on public.supplier_booking_events;
create policy "Suppliers can read own booking events"
  on public.supplier_booking_events
  for select
  using (public.is_supplier_account_editor(supplier_id));

drop policy if exists "Suppliers can read own booking messages" on public.supplier_booking_messages;
create policy "Suppliers can read own booking messages"
  on public.supplier_booking_messages
  for select
  using (public.is_supplier_account_editor(supplier_id));
