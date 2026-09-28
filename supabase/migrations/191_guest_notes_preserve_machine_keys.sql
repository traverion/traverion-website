-- Phase 1330: Traveler special_requests updates cannot rewrite machine stay keys.
--
-- BEFORE: update_guest_booking_special_requests wrote p_special_requests verbatim,
-- so a traveler could inject check_out: YYYY-MM-DD (or wipe booking_option_id /
-- meeting_point / pickup_instructions). Client stayRangeFromBooking preferred notes
-- over nights when check_out column was null — partner ops could shrink vs SQL
-- stay_booking_check_out (column → nights).
--
-- AFTER: guest RPC keeps existing machine key lines and only accepts guest-facing
-- note lines from the client payload.

create or replace function public.guest_facing_booking_notes(p_notes text)
returns text
language plpgsql
immutable
as $$
declare
  v_line text;
  v_out text := '';
begin
  if p_notes is null or length(trim(p_notes)) = 0 then
    return '';
  end if;
  foreach v_line in array string_to_array(p_notes, E'\n')
  loop
    v_line := trim(v_line);
    if v_line = '' then
      continue;
    end if;
    if v_line ~* '^(booking_option_id|check_out|meeting_point|pickup_instructions)\s*:' then
      continue;
    end if;
    if v_out = '' then
      v_out := v_line;
    else
      v_out := v_out || E'\n' || v_line;
    end if;
  end loop;
  return v_out;
end;
$$;

create or replace function public.machine_booking_note_lines(p_notes text)
returns text
language plpgsql
immutable
as $$
declare
  v_line text;
  v_out text := '';
begin
  if p_notes is null or length(trim(p_notes)) = 0 then
    return '';
  end if;
  foreach v_line in array string_to_array(p_notes, E'\n')
  loop
    v_line := trim(v_line);
    if v_line = '' then
      continue;
    end if;
    if v_line ~* '^(booking_option_id|check_out|meeting_point|pickup_instructions)\s*:' then
      if v_out = '' then
        v_out := v_line;
      else
        v_out := v_out || E'\n' || v_line;
      end if;
    end if;
  end loop;
  return v_out;
end;
$$;

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
  v_email text := coalesce(public.jwt_verified_email(), '');
  v_uid uuid := auth.uid();
  v_existing text;
  v_guest text;
  v_machine text;
  v_merged text;
begin
  if (v_email = '' or v_email is null) and v_uid is null then
    return false;
  end if;

  select special_requests into v_existing
  from public.bookings
  where id = p_booking_id
    and status in ('pending', 'confirmed')
    and (
      (length(v_email) > 0 and lower(trim(coalesce(guest_email, ''))) = v_email)
      or (v_uid is not null and guest_user_id = v_uid)
    )
  for update;

  if not found then
    return false;
  end if;

  v_guest := public.guest_facing_booking_notes(p_special_requests);
  v_machine := public.machine_booking_note_lines(v_existing);

  if v_guest <> '' and v_machine <> '' then
    v_merged := v_guest || E'\n' || v_machine;
  elsif v_guest <> '' then
    v_merged := v_guest;
  else
    v_merged := v_machine;
  end if;

  update public.bookings
  set special_requests = left(trim(v_merged), 8000)
  where id = p_booking_id;

  return FOUND;
end;
$$;

revoke all on function public.update_guest_booking_special_requests(uuid, text) from public;
grant execute on function public.update_guest_booking_special_requests(uuid, text) to authenticated;

comment on function public.update_guest_booking_special_requests(uuid, text) is
  'Traveler note update: guest-facing lines from payload; machine keys (check_out/booking_option_id/meeting_point/pickup_instructions) preserved from existing row (Phase 1330).';
