-- Rental availability foundation (additive).
-- Supplier blocks + temporary inventory holds per listing variant.
-- Half-open intervals: [starts_at, ends_at). Not wired to public checkout yet.
-- Publish remains blocked by migration 282.

create table if not exists public.rental_availability_blocks (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  -- Null variant_id = block applies to every option on the listing.
  variant_id text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint rental_availability_blocks_half_open check (ends_at > starts_at)
);

create index if not exists rental_availability_blocks_listing_interval_idx
  on public.rental_availability_blocks (listing_id, starts_at, ends_at);

create index if not exists rental_availability_blocks_listing_variant_idx
  on public.rental_availability_blocks (listing_id, variant_id);

comment on table public.rental_availability_blocks is
  'Supplier-blocked rental intervals (half-open). Consumed by future rental claim path; not decorative.';

create table if not exists public.rental_inventory_holds (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  variant_id text not null,
  quantity integer not null check (quantity >= 1),
  -- Occupied window including turnaround buffer: [starts_at, ends_at).
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'held'
    check (status in ('held', 'confirmed', 'released', 'expired')),
  hold_expires_at timestamptz,
  booking_id uuid references public.bookings(id) on delete set null,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_inventory_holds_half_open check (ends_at > starts_at),
  constraint rental_inventory_holds_idempotency unique (listing_id, idempotency_key)
);

create index if not exists rental_inventory_holds_active_idx
  on public.rental_inventory_holds (listing_id, variant_id, starts_at, ends_at)
  where status in ('held', 'confirmed');

create index if not exists rental_inventory_holds_expires_idx
  on public.rental_inventory_holds (hold_expires_at)
  where status = 'held' and hold_expires_at is not null;

comment on table public.rental_inventory_holds is
  'Rental inventory holds/reservations per variant. Atomic claim path to be added before public booking.';

alter table public.rental_availability_blocks enable row level security;
alter table public.rental_inventory_holds enable row level security;

-- Blocks: suppliers manage own listings; public read only for published (none yet for rentals).
drop policy if exists "Suppliers manage rental availability blocks" on public.rental_availability_blocks;
create policy "Suppliers manage rental availability blocks"
  on public.rental_availability_blocks
  for all
  using (
    exists (
      select 1 from public.listings l
      where l.id = rental_availability_blocks.listing_id
        and public.is_supplier_account_side(l.supplier_id)
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = rental_availability_blocks.listing_id
        and public.is_supplier_account_side(l.supplier_id)
    )
  );

-- Holds: no direct client writes. Service role / SECURITY DEFINER claim only.
drop policy if exists "Suppliers read rental inventory holds" on public.rental_inventory_holds;
create policy "Suppliers read rental inventory holds"
  on public.rental_inventory_holds
  for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = rental_inventory_holds.listing_id
        and public.is_supplier_account_side(l.supplier_id)
    )
  );

-- Expire abandoned holds (callable from claim path / cron later).
create or replace function public.expire_stale_rental_holds(p_listing_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.rental_inventory_holds
  set status = 'expired', updated_at = now()
  where status = 'held'
    and hold_expires_at is not null
    and hold_expires_at < now()
    and (p_listing_id is null or listing_id = p_listing_id);
  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.expire_stale_rental_holds(uuid) from public;
grant execute on function public.expire_stale_rental_holds(uuid) to authenticated, service_role;

comment on function public.expire_stale_rental_holds(uuid) is
  'Marks expired rental holds. Safe to call before availability checks; no checkout wiring yet.';
