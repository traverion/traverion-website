-- Owner-approved production hardening (2026-11-13) on xcopqllkulxfkpunetbc.
-- Privilege revoke plus an authorization bind on claim_stay_booking_request_accept.
-- No schema, money, or booking-flow changes.
-- claim + freeze stay service_role only.
-- supplier_active_commercial_terms stays authenticated + service_role (anon revoked).
-- The edge stay-booking-request-action calls claim as service_role with auth.getUser().id,
-- never a client-supplied actor id.

create or replace function public.claim_stay_booking_request_accept(
  p_booking_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bookings%rowtype;
  v_listing_supplier uuid;
  v_team boolean := false;
  v_updated uuid;
  v_check_out date;
  v_actor uuid;
  v_jwt_role text := coalesce(auth.role(), '');
  v_jwt_user uuid := auth.uid();
begin
  if p_booking_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_args');
  end if;

  -- Service role is the Edge path. It must pass the user id already verified
  -- with auth.getUser(). A user JWT cannot impersonate another actor.
  -- Anonymous and any session without a user id are rejected here even if
  -- EXECUTE is later re-granted by mistake.
  if v_jwt_role = 'service_role' then
    if p_actor_id is null then
      return jsonb_build_object('ok', false, 'reason', 'missing_args');
    end if;
    v_actor := p_actor_id;
  elsif v_jwt_user is null then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  elsif p_actor_id is not null and p_actor_id is distinct from v_jwt_user then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  else
    v_actor := v_jwt_user;
  end if;

  select * into v_row from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if lower(coalesce(v_row.payment_status, '')) = 'paid'
     and lower(coalesce(v_row.approval_status, '')) = 'accepted' then
    return jsonb_build_object('ok', true, 'reason', 'already_captured', 'booking_id', p_booking_id);
  end if;

  if lower(coalesce(v_row.payment_status, '')) = 'authorized'
     and lower(coalesce(v_row.approval_status, '')) = 'accepted' then
    return jsonb_build_object('ok', true, 'reason', 'already_claimed', 'booking_id', p_booking_id);
  end if;

  if lower(coalesce(v_row.status, '')) = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'cancelled');
  end if;

  if lower(coalesce(v_row.payment_status, '')) <> 'authorized'
     or lower(coalesce(v_row.approval_status, '')) <> 'pending' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_acceptable',
      'payment_status', v_row.payment_status,
      'approval_status', v_row.approval_status
    );
  end if;

  if v_row.approval_expires_at is not null and v_row.approval_expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select supplier_id into v_listing_supplier from public.listings where id = v_row.listing_id;
  if v_listing_supplier is null then
    return jsonb_build_object('ok', false, 'reason', 'listing_missing');
  end if;

  if v_listing_supplier = v_actor then
    v_team := true;
  else
    select exists (
      select 1 from public.supplier_team_members
      where supplier_id = v_listing_supplier
        and user_id = v_actor
        and lower(coalesce(role, '')) in ('owner', 'admin', 'editor')
    ) into v_team;
  end if;

  if not v_team then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if v_row.listing_id is not null
     and v_row.booking_date is not null
     and coalesce(v_row.guests, 0) >= 1 then
    if public.booking_is_stay_night(v_row) then
      v_check_out := public.stay_booking_check_out(v_row);
    else
      v_check_out := case
        when v_row.check_out is not null and v_row.check_out > v_row.booking_date then v_row.check_out
        else null
      end;
    end if;
    perform public.assert_checkout_inventory(
      v_row.listing_id,
      v_row.booking_date,
      v_row.guests,
      v_check_out,
      v_row.id,
      v_row.start_time,
      v_row.booking_option_id
    );
  end if;

  update public.bookings
  set
    approval_status = 'accepted',
    approval_decided_at = now(),
    approval_decided_by = v_actor
  where id = p_booking_id
    and payment_status = 'authorized'
    and approval_status = 'pending'
    and coalesce(status, '') is distinct from 'cancelled'
  returning id into v_updated;

  if v_updated is null then
    return jsonb_build_object('ok', false, 'reason', 'update_race');
  end if;

  return jsonb_build_object('ok', true, 'reason', 'claimed', 'booking_id', v_updated);
end;
$$;

revoke all on function public.claim_stay_booking_request_accept(uuid, uuid) from public;
revoke all on function public.claim_stay_booking_request_accept(uuid, uuid) from anon, authenticated;
grant execute on function public.claim_stay_booking_request_accept(uuid, uuid) to service_role;

revoke all on function public.freeze_booking_commercial_terms(uuid) from public;
revoke all on function public.freeze_booking_commercial_terms(uuid) from anon, authenticated;
grant execute on function public.freeze_booking_commercial_terms(uuid) to service_role;

revoke all on function public.supplier_active_commercial_terms(uuid, timestamptz) from public;
revoke all on function public.supplier_active_commercial_terms(uuid, timestamptz) from anon;
grant execute on function public.supplier_active_commercial_terms(uuid, timestamptz) to authenticated, service_role;
