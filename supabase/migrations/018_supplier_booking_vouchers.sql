-- Supplier vouchers for booking retention/recovery campaigns.

create table if not exists public.supplier_booking_vouchers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  supplier_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  code text not null unique,
  guest_email text,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  status text not null default 'active' check (status in ('active', 'redeemed', 'expired')),
  notes text,
  expires_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_booking_vouchers_supplier_idx
  on public.supplier_booking_vouchers(supplier_id, created_at desc);
create index if not exists supplier_booking_vouchers_booking_idx
  on public.supplier_booking_vouchers(booking_id);

alter table public.supplier_booking_vouchers enable row level security;

drop policy if exists "Suppliers can read own vouchers" on public.supplier_booking_vouchers;
create policy "Suppliers can read own vouchers"
  on public.supplier_booking_vouchers
  for select using (supplier_id = auth.uid());

drop policy if exists "Suppliers can write own vouchers" on public.supplier_booking_vouchers;
create policy "Suppliers can write own vouchers"
  on public.supplier_booking_vouchers
  for insert with check (supplier_id = auth.uid());

drop policy if exists "Suppliers can update own vouchers" on public.supplier_booking_vouchers;
create policy "Suppliers can update own vouchers"
  on public.supplier_booking_vouchers
  for update using (supplier_id = auth.uid())
  with check (supplier_id = auth.uid());

