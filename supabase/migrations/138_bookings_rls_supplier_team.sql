-- Phase 1137: bookings SELECT/UPDATE RLS includes supplier team members
-- (parity with is_booking_party Phase 1136). listings.supplier_id is uuid;
-- supplier_team_members.supplier_id / user_id are text.

create or replace function public.is_listing_supplier_side(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.listings l
    where l.id = p_listing_id
      and auth.uid() is not null
      and (
        l.supplier_id = auth.uid()
        or exists (
          select 1
          from public.supplier_team_members stm
          where stm.supplier_id = l.supplier_id::text
            and stm.user_id = auth.uid()::text
        )
      )
  );
$$;

comment on function public.is_listing_supplier_side(uuid) is
  'True when auth.uid() is the listing supplier or a supplier_team_members row for that supplier.';

drop policy if exists "Suppliers can view bookings for their listings" on public.bookings;
create policy "Suppliers can view bookings for their listings"
  on public.bookings for select
  using (public.is_listing_supplier_side(bookings.listing_id));

drop policy if exists "Suppliers can update booking status for their listings" on public.bookings;
create policy "Suppliers can update booking status for their listings"
  on public.bookings for update
  using (public.is_listing_supplier_side(bookings.listing_id))
  with check (public.is_listing_supplier_side(bookings.listing_id));
