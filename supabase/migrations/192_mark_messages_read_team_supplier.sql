-- Phase 1334: mark_booking_messages_read treats supplier team as supplier-side.
--
-- BEFORE: only listings.supplier_id = auth.uid() took the supplier read path.
-- Team members (is_listing_supplier_side) fell through to the traveler branch:
-- they never cleared read_by_supplier_at on guest messages, and incorrectly
-- stamped read_by_traveler_at on host/system messages the guest may not have read.
--
-- AFTER: same party split as post_booking_message (Phase 1141).

create or replace function public.mark_booking_messages_read(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_supplier uuid;
  v_listing_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;
  if not public.is_booking_party(p_booking_id) then
    return jsonb_build_object('ok', false, 'error', 'You cannot open this conversation.');
  end if;
  select l.supplier_id, b.listing_id into v_supplier, v_listing_id
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;
  if v_supplier = v_uid or public.is_listing_supplier_side(v_listing_id) then
    update public.booking_messages
      set read_by_supplier_at = coalesce(read_by_supplier_at, now())
    where booking_id = p_booking_id and sender_role = 'traveler' and read_by_supplier_at is null;
  else
    update public.booking_messages
      set read_by_traveler_at = coalesce(read_by_traveler_at, now())
    where booking_id = p_booking_id and sender_role in ('supplier', 'system') and read_by_traveler_at is null;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.mark_booking_messages_read(uuid) is
  'Marks inbound messages read for the caller side; supplier-side includes listing team (Phase 1334).';
