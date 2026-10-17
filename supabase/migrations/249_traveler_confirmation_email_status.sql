-- Traveler-owned read of whether the paid confirmation email was accepted.
-- The log itself stays closed to clients. This returns only the latest status.

create or replace function public.traveler_confirmation_email_status(p_booking_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select l.status
  from public.bookings b
  inner join public.transactional_email_log l
    on l.entity_type = 'booking'
   and l.entity_id = b.id::text
   and l.channel = 'customer'
   and l.template_key = 'booking_confirmed_paid'
  where b.id = p_booking_id
    and public.booking_traveler_owns(b.guest_user_id, b.guest_email)
  order by l.created_at desc
  limit 1;
$$;

revoke all on function public.traveler_confirmation_email_status(uuid) from public;
grant execute on function public.traveler_confirmation_email_status(uuid) to authenticated;

comment on function public.traveler_confirmation_email_status(uuid) is
  'Latest booking_confirmed_paid email status (sent, skipped, or failed) for a booking the caller owns. Null when nothing is recorded yet.';
