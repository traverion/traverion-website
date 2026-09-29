-- Phase 1707: After admin/supplier unpublish (status → draft), travelers still have
-- paid bookings but listings RLS only allows SELECT when status = 'published'
-- (or supplier-side). Trips therefore lost supplier_id and skipped
-- cancellation_accepted/declined (and related) host notifies — UI success, no email.
--
-- Fix: SECURITY DEFINER RPC returns listing ops columns for listings the caller
-- is booking-party on (traveler owns a booking on the listing, or supplier-side).

create or replace function public.listing_ops_for_booking_party(p_listing_ids uuid[])
returns table (
  id uuid,
  title text,
  supplier_id uuid,
  meeting_point text,
  pickup_instructions text,
  image text,
  destination text,
  city text,
  status text,
  listing_extras jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    l.title,
    l.supplier_id,
    l.meeting_point,
    l.pickup_instructions,
    l.image,
    l.destination,
    l.city,
    l.status::text,
    l.listing_extras
  from public.listings l
  where p_listing_ids is not null
    and l.id = any (p_listing_ids)
    and auth.uid() is not null
    and (
      public.is_supplier_account_side(l.supplier_id)
      or exists (
        select 1
        from public.bookings b
        where b.listing_id = l.id
          and public.booking_traveler_owns(b.guest_user_id, b.guest_email)
      )
    );
$$;

comment on function public.listing_ops_for_booking_party(uuid[]) is
  'Phase 1707: listing ops (incl. supplier_id) for draft/unpublished listings when caller is booking party.';

revoke all on function public.listing_ops_for_booking_party(uuid[]) from public;
grant execute on function public.listing_ops_for_booking_party(uuid[]) to authenticated;
