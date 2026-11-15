-- P1.1: Late traveler cancels with refund_choice = no_refund keep supplier earnings.
-- Those bookings must not be permanently blocked from payout eligibility, and tour
-- fulfillment attestation must not be required (service never completes).
-- Does NOT reverse legitimate retained earnings. Refunded / refund-due cancels still block.

create or replace function public.booking_is_supplier_retained_cancel(p_booking_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
  v_pay text;
  v_choice text;
begin
  select
    lower(trim(coalesce(b.status, ''))),
    lower(trim(coalesce(b.payment_status, ''))),
    lower(trim(coalesce(b.refund_choice, '')))
  into v_status, v_pay, v_choice
  from public.bookings b
  where b.id = p_booking_id;

  if v_status is null then
    return false;
  end if;

  return v_status = 'cancelled'
    and v_choice = 'no_refund'
    and v_pay in ('paid', 'complete', 'succeeded');
end;
$$;

comment on function public.booking_is_supplier_retained_cancel(uuid) is
  'True when a cancelled booking keeps the charge (refund_choice=no_refund) and payment is still confirmed — supplier earnings must not be reversed or permanently blocked.';

revoke all on function public.booking_is_supplier_retained_cancel(uuid) from public;
revoke all on function public.booking_is_supplier_retained_cancel(uuid) from anon, authenticated;
grant execute on function public.booking_is_supplier_retained_cancel(uuid) to service_role;

create or replace function public.booking_blocks_payout_eligibility(p_booking_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
  v_pay text;
  v_dispute text;
  v_resolution text;
  v_fulfill text;
  v_hold boolean;
  v_support boolean;
begin
  select
    lower(trim(coalesce(b.status, ''))),
    lower(trim(coalesce(b.payment_status, ''))),
    lower(trim(coalesce(b.dispute_status, ''))),
    lower(trim(coalesce(b.cancellation_resolution, ''))),
    lower(trim(coalesce(b.service_fulfillment_status, '')))
  into v_status, v_pay, v_dispute, v_resolution, v_fulfill
  from public.bookings b
  where b.id = p_booking_id;

  if v_status is null then
    return true;
  end if;

  -- Cancelled blocks unless supplier-retained no_refund (late cancel keeps earnings).
  if v_status = 'cancelled' and not public.booking_is_supplier_retained_cancel(p_booking_id) then
    return true;
  end if;
  if v_status = 'no_show' then
    return true;
  end if;
  if v_pay in ('refunded', 'failed') then
    return true;
  end if;
  if v_resolution in ('pending_customer_choice', 'reschedule') then
    return true;
  end if;
  if v_dispute in ('open', 'needs_response', 'under_review', 'lost') then
    return true;
  end if;
  if v_fulfill in ('no_show', 'disputed') then
    return true;
  end if;

  select exists (
    select 1 from public.booking_financial_holds h
    where h.booking_id = p_booking_id and h.active
  ) into v_hold;
  if coalesce(v_hold, false) then
    return true;
  end if;

  select exists (
    select 1 from public.booking_support_cases c
    where c.booking_id = p_booking_id
      and c.status in ('submitted', 'under_review', 'waiting_operator', 'escalated')
  ) into v_support;
  if coalesce(v_support, false) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.booking_blocks_payout_eligibility(uuid) from public;
revoke all on function public.booking_blocks_payout_eligibility(uuid) from anon, authenticated;
grant execute on function public.booking_blocks_payout_eligibility(uuid) to service_role;

create or replace function public.booking_payout_include_blocked_reasons(p_booking_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reasons text[] := array[]::text[];
  v_pay text;
  v_status text;
  v_fulfill text;
  v_supplier_id uuid;
  v_flags jsonb;
  v_flag text;
  v_is_tour boolean;
  v_retained boolean;
begin
  select
    lower(trim(coalesce(b.payment_status, ''))),
    lower(trim(coalesce(b.status, ''))),
    lower(trim(coalesce(b.service_fulfillment_status, ''))),
    l.supplier_id,
    public.booking_is_tour(b.id),
    public.booking_is_supplier_retained_cancel(b.id)
  into v_pay, v_status, v_fulfill, v_supplier_id, v_is_tour, v_retained
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;

  if not found then
    return array['booking_not_found'];
  end if;

  if public.booking_blocks_payout_eligibility(p_booking_id) then
    v_reasons := array_append(v_reasons, 'blocked_by_policy');
  end if;

  if v_status = 'cancelled' and not coalesce(v_retained, false) then
    v_reasons := array_append(v_reasons, 'booking_cancelled');
  end if;
  if v_status = 'no_show' or v_fulfill = 'no_show' then
    v_reasons := array_append(v_reasons, 'no_show');
  end if;
  if v_fulfill = 'disputed' then
    v_reasons := array_append(v_reasons, 'fulfillment_disputed');
  end if;

  if v_pay = '' then
    v_reasons := array_append(v_reasons, 'payment_unknown');
  elsif v_pay = 'refunded' then
    v_reasons := array_append(v_reasons, 'payment_refunded');
  elsif v_pay not in ('paid', 'complete', 'succeeded') then
    v_reasons := array_append(v_reasons, 'payment_not_confirmed');
  end if;

  if v_supplier_id is null
     or not exists (select 1 from public.supplier_profiles sp where sp.id = v_supplier_id) then
    v_reasons := array_append(v_reasons, 'invalid_supplier');
  end if;

  -- Tours require fulfillment attestation unless supplier-retained cancel (no service to attest).
  if coalesce(v_is_tour, false) and not coalesce(v_retained, false) then
    if v_fulfill is distinct from 'completed' then
      v_reasons := array_append(v_reasons, 'tour_fulfillment_not_attested');
      if v_fulfill is null or v_fulfill = '' or v_fulfill = 'scheduled' then
        v_reasons := array_append(v_reasons, 'missing_policy_inferred_completion_disabled');
      end if;
    end if;
  end if;

  v_flags := public.booking_ledger_reconcile_flags(p_booking_id);
  if jsonb_array_length(coalesce(v_flags, '[]'::jsonb)) > 0 then
    v_reasons := array_append(v_reasons, 'unreconciled');
    for v_flag in select jsonb_array_elements_text(v_flags)
    loop
      if not (v_flag = any (v_reasons)) then
        v_reasons := array_append(v_reasons, v_flag);
      end if;
    end loop;
  end if;

  return v_reasons;
end;
$$;

revoke all on function public.booking_payout_include_blocked_reasons(uuid) from public;
revoke all on function public.booking_payout_include_blocked_reasons(uuid) from anon, authenticated;
grant execute on function public.booking_payout_include_blocked_reasons(uuid) to service_role;

create or replace function public.refresh_supplier_earning_eligibility(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer := 0;
  v_demoted integer := 0;
  v_hold_hours integer;
  v_completed integer := 0;
  v_gate_demoted integer := 0;
  v_retained_touched integer := 0;
begin
  select value_int into v_hold_hours
  from public.commercial_runtime_config where key = 'payout_hold_hours';
  v_hold_hours := coalesce(v_hold_hours, 48);

  -- Supplier-retained cancels: settle without tour fulfillment attestation.
  update public.supplier_earning_items e
    set
      service_completed_at = coalesce(
        e.service_completed_at,
        (select b.cancelled_at from public.bookings b where b.id = e.booking_id),
        public.booking_service_completion_at(e.booking_id),
        e.experience_at
      ),
      experience_at = coalesce(
        e.experience_at,
        (select b.cancelled_at from public.bookings b where b.id = e.booking_id),
        public.booking_service_completion_at(e.booking_id)
      ),
      eligible_at = coalesce(
        e.service_completed_at,
        (select b.cancelled_at from public.bookings b where b.id = e.booking_id),
        public.booking_service_completion_at(e.booking_id),
        e.experience_at
      ) + make_interval(hours => v_hold_hours),
      updated_at = now()
  where e.status in ('pending', 'eligible')
    and e.amount_minor > 0
    and public.booking_is_supplier_retained_cancel(e.booking_id);
  get diagnostics v_retained_touched = row_count;

  -- Backfill completion clocks for active bookings.
  update public.supplier_earning_items e
    set
      service_completed_at = case
        when public.booking_is_supplier_retained_cancel(e.booking_id) then e.service_completed_at
        when public.booking_is_tour(e.booking_id) then
          case
            when exists (
              select 1 from public.bookings b
              where b.id = e.booking_id
                and lower(coalesce(b.service_fulfillment_status, '')) = 'completed'
            ) then coalesce(
              e.service_completed_at,
              (
                select b.service_fulfilled_at from public.bookings b where b.id = e.booking_id
              ),
              public.booking_service_completion_at(e.booking_id)
            )
            else null
          end
        else coalesce(e.service_completed_at, public.booking_service_completion_at(e.booking_id))
      end,
      experience_at = case
        when public.booking_is_supplier_retained_cancel(e.booking_id) then e.experience_at
        when public.booking_is_tour(e.booking_id) then
          case
            when exists (
              select 1 from public.bookings b
              where b.id = e.booking_id
                and lower(coalesce(b.service_fulfillment_status, '')) = 'completed'
            ) then coalesce(
              e.experience_at,
              (
                select b.service_fulfilled_at from public.bookings b where b.id = e.booking_id
              ),
              public.booking_service_completion_at(e.booking_id)
            )
            else e.experience_at
          end
        else coalesce(e.experience_at, public.booking_service_completion_at(e.booking_id))
      end,
      eligible_at = case
        when public.booking_is_supplier_retained_cancel(e.booking_id) then e.eligible_at
        when public.booking_is_tour(e.booking_id)
          and not exists (
            select 1 from public.bookings b
            where b.id = e.booking_id
              and lower(coalesce(b.service_fulfillment_status, '')) = 'completed'
          )
        then null
        when public.booking_is_tour(e.booking_id) then
          coalesce(
            (
              select b.service_fulfilled_at from public.bookings b where b.id = e.booking_id
            ),
            public.booking_service_completion_at(e.booking_id)
          ) + make_interval(hours => v_hold_hours)
        when public.booking_service_completion_at(e.booking_id) is null then e.eligible_at
        else public.booking_service_completion_at(e.booking_id)
          + make_interval(hours => v_hold_hours)
      end,
      updated_at = now()
  where e.status in ('pending', 'eligible')
    and e.amount_minor > 0
    and not public.booking_is_supplier_retained_cancel(e.booking_id);
  get diagnostics v_completed = row_count;

  update public.supplier_earning_items e
    set status = case when e.amount_minor = 0 then 'reversed' else 'pending' end,
        updated_at = now()
  where e.status = 'eligible'
    and public.booking_blocks_payout_eligibility(e.booking_id);
  get diagnostics v_demoted = row_count;

  update public.supplier_earning_items e
    set status = 'pending', updated_at = now()
  where e.status = 'eligible'
    and not public.booking_payout_include_allowed(e.booking_id);
  get diagnostics v_gate_demoted = row_count;

  update public.supplier_earning_items e
    set status = 'eligible', updated_at = now()
  where e.status = 'pending'
    and e.eligible_at is not null
    and e.eligible_at <= p_now
    and e.service_completed_at is not null
    and e.service_completed_at <= p_now
    and e.amount_minor > 0
    and not public.booking_blocks_payout_eligibility(e.booking_id)
    and public.booking_payout_include_allowed(e.booking_id);
  get diagnostics v_n = row_count;

  return jsonb_build_object(
    'ok', true,
    'promoted', v_n,
    'demoted', coalesce(v_demoted, 0),
    'gate_demoted', coalesce(v_gate_demoted, 0),
    'completion_backfill_touched', coalesce(v_completed, 0),
    'retained_cancel_touched', coalesce(v_retained_touched, 0),
    'payout_hold_hours', v_hold_hours,
    'requires_tour_fulfillment_attestation', true,
    'requires_ledger_reconcile_ok', true
  );
end;
$$;

revoke all on function public.refresh_supplier_earning_eligibility(timestamptz) from public;
revoke all on function public.refresh_supplier_earning_eligibility(timestamptz) from anon, authenticated;
grant execute on function public.refresh_supplier_earning_eligibility(timestamptz) to service_role;
