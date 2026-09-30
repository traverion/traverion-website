-- Phase 1743: bookings UPDATE requires booking-editor team roles
-- (owner / manager / ops). Finance and viewer may still SELECT via
-- is_listing_supplier_side, matching canManageBookings in the partner UI.

create or replace function public.is_listing_supplier_bookings_editor(p_listing_id uuid)
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
            and lower(trim(coalesce(stm.role, ''))) in ('owner', 'manager', 'ops')
        )
      )
  );
$$;

comment on function public.is_listing_supplier_bookings_editor(uuid) is
  'Phase 1743: true when auth.uid() is the listing supplier or a team member with owner/manager/ops (not finance/viewer).';

revoke all on function public.is_listing_supplier_bookings_editor(uuid) from public;
grant execute on function public.is_listing_supplier_bookings_editor(uuid) to authenticated;
grant execute on function public.is_listing_supplier_bookings_editor(uuid) to service_role;

drop policy if exists "Suppliers can update booking status for their listings" on public.bookings;
create policy "Suppliers can update booking status for their listings"
  on public.bookings for update
  using (public.is_listing_supplier_bookings_editor(bookings.listing_id))
  with check (public.is_listing_supplier_bookings_editor(bookings.listing_id));
