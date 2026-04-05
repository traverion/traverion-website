-- Supplier offline-safe ops notes per booking (sync target).

create table if not exists public.supplier_booking_ops_notes (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  supplier_id uuid not null references auth.users(id) on delete cascade,
  note text not null,
  updated_at timestamptz not null default now()
);

create index if not exists supplier_booking_ops_notes_supplier_idx
  on public.supplier_booking_ops_notes(supplier_id, updated_at desc);

alter table public.supplier_booking_ops_notes enable row level security;

drop policy if exists "Suppliers can read own booking notes" on public.supplier_booking_ops_notes;
create policy "Suppliers can read own booking notes"
  on public.supplier_booking_ops_notes
  for select
  using (supplier_id = auth.uid());

drop policy if exists "Suppliers can upsert own booking notes" on public.supplier_booking_ops_notes;
create policy "Suppliers can upsert own booking notes"
  on public.supplier_booking_ops_notes
  for insert
  with check (supplier_id = auth.uid());

drop policy if exists "Suppliers can update own booking notes" on public.supplier_booking_ops_notes;
create policy "Suppliers can update own booking notes"
  on public.supplier_booking_ops_notes
  for update
  using (supplier_id = auth.uid())
  with check (supplier_id = auth.uid());

drop policy if exists "Suppliers can delete own booking notes" on public.supplier_booking_ops_notes;
create policy "Suppliers can delete own booking notes"
  on public.supplier_booking_ops_notes
  for delete
  using (supplier_id = auth.uid());

