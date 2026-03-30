-- Secure RPC: guests may update only special_requests on their own active bookings.

create or replace function public.update_guest_booking_special_requests(
  p_booking_id uuid,
  p_special_requests text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := auth.jwt() ->> 'email';
begin
  if v_email is null or length(trim(v_email)) = 0 then
    return false;
  end if;
  update public.bookings
  set special_requests = left(trim(p_special_requests), 8000)
  where id = p_booking_id
    and guest_email = v_email
    and status in ('pending', 'confirmed');
  return FOUND;
end;
$$;

revoke all on function public.update_guest_booking_special_requests(uuid, text) from public;
grant execute on function public.update_guest_booking_special_requests(uuid, text) to authenticated;
