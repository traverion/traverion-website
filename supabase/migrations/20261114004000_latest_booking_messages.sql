-- One latest message per booking for the partner inbox and home unread count.
-- Security invoker so booking_messages RLS (is_booking_party) still applies.
-- Does not change message inserts, cancellation, or financial functions.

create or replace function public.latest_booking_messages(p_booking_ids uuid[])
returns table (
  id uuid,
  booking_id uuid,
  sender_role text,
  sender_user_id uuid,
  body text,
  created_at timestamptz,
  read_by_traveler_at timestamptz,
  read_by_supplier_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (m.booking_id)
    m.id,
    m.booking_id,
    m.sender_role,
    m.sender_user_id,
    m.body,
    m.created_at,
    m.read_by_traveler_at,
    m.read_by_supplier_at
  from public.booking_messages m
  where coalesce(cardinality(p_booking_ids), 0) between 1 and 80
    and m.booking_id = any (p_booking_ids)
  order by m.booking_id, m.created_at desc;
$$;

revoke all on function public.latest_booking_messages(uuid[]) from public, anon;
grant execute on function public.latest_booking_messages(uuid[]) to authenticated;
