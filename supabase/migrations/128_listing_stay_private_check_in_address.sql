-- Phase 1081: Stay exact check-in address is purchase/ops private — not public listing JSON.
--
-- Before: listing_extras.stay.checkInAddress lived on published listings rows that
-- anon/authenticated can SELECT (mig 052). UI hid the field; PostgREST still returned it.
--
-- After: address lives in listing_stay_private (owner + service_role only).
-- Public listing_extras is stripped of checkInAddress. Booked guests get it via
-- purchase_snapshot on their booking (already RLS party-scoped).

create table if not exists public.listing_stay_private (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  check_in_address text,
  updated_at timestamptz not null default now(),
  constraint listing_stay_private_address_len check (
    check_in_address is null or char_length(check_in_address) <= 400
  )
);

comment on table public.listing_stay_private is
  'Exact stay arrival address for hosts and checkout snapshot. Never public-select.';
comment on column public.listing_stay_private.check_in_address is
  'Street / building / entry notes. Frozen onto purchase_snapshot at checkout.';

alter table public.listing_stay_private enable row level security;

drop policy if exists "listing_stay_private_select_owner" on public.listing_stay_private;
create policy "listing_stay_private_select_owner"
  on public.listing_stay_private for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.supplier_id = auth.uid()
    )
  );

drop policy if exists "listing_stay_private_insert_owner" on public.listing_stay_private;
create policy "listing_stay_private_insert_owner"
  on public.listing_stay_private for insert
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.supplier_id = auth.uid()
    )
  );

drop policy if exists "listing_stay_private_update_owner" on public.listing_stay_private;
create policy "listing_stay_private_update_owner"
  on public.listing_stay_private for update
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.supplier_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.supplier_id = auth.uid()
    )
  );

drop policy if exists "listing_stay_private_delete_owner" on public.listing_stay_private;
create policy "listing_stay_private_delete_owner"
  on public.listing_stay_private for delete
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.supplier_id = auth.uid()
    )
  );

revoke all on table public.listing_stay_private from anon;
grant select, insert, update, delete on table public.listing_stay_private to authenticated;
grant all on table public.listing_stay_private to service_role;

-- Move existing addresses out of public JSON, then strip the key.
insert into public.listing_stay_private (listing_id, check_in_address)
select
  l.id,
  nullif(trim(l.listing_extras #>> '{stay,checkInAddress}'), '')
from public.listings l
where nullif(trim(l.listing_extras #>> '{stay,checkInAddress}'), '') is not null
on conflict (listing_id) do update
set
  check_in_address = excluded.check_in_address,
  updated_at = now();

update public.listings
set listing_extras =
  case
    when listing_extras ? 'stay' and jsonb_typeof(listing_extras->'stay') = 'object' then
      jsonb_set(
        listing_extras,
        '{stay}',
        (listing_extras->'stay') - 'checkInAddress',
        true
      )
    else listing_extras
  end
where listing_extras #>> '{stay,checkInAddress}' is not null;
