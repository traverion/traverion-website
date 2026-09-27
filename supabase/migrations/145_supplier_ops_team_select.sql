-- Phase 1149: team SELECT on supplier ops event/message tables.

drop policy if exists "Suppliers can read own booking events" on public.supplier_booking_events;
create policy "Suppliers can read own booking events"
  on public.supplier_booking_events
  for select
  using (public.is_supplier_account_side(supplier_id));

drop policy if exists "Suppliers can read own booking messages" on public.supplier_booking_messages;
create policy "Suppliers can read own booking messages"
  on public.supplier_booking_messages
  for select
  using (public.is_supplier_account_side(supplier_id));
