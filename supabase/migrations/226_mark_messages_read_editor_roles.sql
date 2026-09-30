-- Phase 1762: mark_booking_messages_read supplier stamp requires editor roles.
-- Finance/viewer remain is_booking_party for read; opening a thread must not
-- clear Unread for owner/manager/ops.

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

  if v_supplier = v_uid or public.is_listing_supplier_bookings_editor(v_listing_id) then
    update public.booking_messages
      set read_by_supplier_at = coalesce(read_by_supplier_at, now())
    where booking_id = p_booking_id and sender_role = 'traveler' and read_by_supplier_at is null;
  elsif public.is_listing_supplier_side(v_listing_id) then
    -- Phase 1762: finance/viewer can read without clearing host Unread.
    null;
  else
    update public.booking_messages
      set read_by_traveler_at = coalesce(read_by_traveler_at, now())
    where booking_id = p_booking_id and sender_role in ('supplier', 'system') and read_by_traveler_at is null;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.mark_booking_messages_read(uuid) is
  'Phase 1762: supplier read stamp requires editor roles; finance/viewer read-only on Unread.';
