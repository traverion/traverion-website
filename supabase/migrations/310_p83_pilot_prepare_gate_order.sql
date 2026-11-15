-- P8.3 follow-up: report READY conflict and confirmation errors before Connect gates,
-- so isolation failures are not masked by connect_incomplete during pilot certification.

create or replace function public.prepare_supplier_payout_pilot(
  p_pilot_label text,
  p_confirm_booking_ref text,
  p_confirm_amount_minor bigint,
  p_actor_id uuid default null,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := nullif(btrim(coalesce(p_pilot_label, '')), '');
  v_ref text := nullif(btrim(coalesce(p_confirm_booking_ref, '')), '');
  v_preview jsonb;
  v_sel public.supplier_payout_pilot_selections;
  v_e public.supplier_earning_items;
  v_b public.bookings;
  v_sp public.supplier_profiles;
  v_period_id uuid;
  v_period_key text;
  v_enabled boolean := false;
  v_existing_ready int := 0;
  v_other_moved int := 0;
  v_cadence text := 'monthly';
  v_terms public.supplier_commercial_terms;
begin
  if v_label is null then
    return jsonb_build_object('ok', false, 'error', 'pilot_label_required');
  end if;
  if v_ref is null then
    return jsonb_build_object('ok', false, 'error', 'confirm_booking_ref_required');
  end if;
  if p_confirm_amount_minor is null or p_confirm_amount_minor <= 0 then
    return jsonb_build_object('ok', false, 'error', 'confirm_amount_required');
  end if;

  perform pg_advisory_xact_lock(hashtext('prepare_supplier_payout_pilot:' || v_label));

  v_preview := public.preview_supplier_payout_pilot(v_label);
  if coalesce((v_preview->>'ok')::boolean, false) is not true then
    return v_preview || jsonb_build_object('dry_run', coalesce(p_dry_run, true));
  end if;

  select * into v_sel
  from public.supplier_payout_pilot_selections
  where pilot_label = v_label and status = 'selected'
  for update;

  if v_sel.id is null then
    return jsonb_build_object('ok', false, 'error', 'pilot_selection_missing');
  end if;

  select * into v_e from public.supplier_earning_items where id = v_sel.earning_item_id for update;
  select * into v_b from public.bookings where id = v_sel.booking_id;
  select * into v_sp from public.supplier_profiles where id = v_sel.supplier_id;

  if upper(coalesce(v_b.public_reference, v_sel.public_reference, '')) <> upper(v_ref) then
    return jsonb_build_object(
      'ok', false,
      'error', 'booking_ref_confirmation_mismatch',
      'expected', coalesce(v_b.public_reference, v_sel.public_reference)
    );
  end if;

  if v_e.amount_minor is distinct from p_confirm_amount_minor
     or v_sel.amount_minor is distinct from p_confirm_amount_minor then
    return jsonb_build_object(
      'ok', false,
      'error', 'amount_confirmation_mismatch',
      'expected_minor', v_e.amount_minor
    );
  end if;

  if v_e.status is distinct from 'eligible' or v_e.payout_period_id is not null then
    return jsonb_build_object('ok', false, 'error', 'earning_no_longer_eligible_or_allocated');
  end if;
  if v_e.gross_minor is null or v_e.commission_bps is null
     or v_e.commission_minor + v_e.amount_minor is distinct from v_e.gross_minor then
    return jsonb_build_object('ok', false, 'error', 'commission_changed_or_missing');
  end if;
  if not public.booking_payout_include_allowed(v_e.booking_id)
     or public.booking_requires_earning_reversal(v_e.booking_id) then
    return jsonb_build_object('ok', false, 'error', 'include_or_reversal_gate_failed');
  end if;

  select count(*)::int into v_existing_ready
  from public.supplier_payout_periods
  where supplier_id = v_sel.supplier_id
    and status = 'ready'
    and note ilike '%' || v_label || '%';

  if v_existing_ready > 0 then
    return jsonb_build_object('ok', false, 'error', 'pilot_ready_period_already_exists');
  end if;

  if coalesce(v_sp.connect_account_livemode, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'connect_not_live');
  end if;
  if coalesce(v_sp.connect_payouts_enabled, false) is not true
     or coalesce(v_sp.connect_onboarding_status, '') <> 'complete' then
    return jsonb_build_object('ok', false, 'error', 'connect_incomplete');
  end if;

  if coalesce(p_dry_run, true) then
    insert into public.financial_audit_log (
      actor_id, action, supplier_id, booking_id, amount_minor, currency, reason, provider_ref, after_state
    ) values (
      p_actor_id,
      'p83_pilot_prepare_dry_run',
      v_sel.supplier_id,
      v_sel.booking_id,
      v_sel.amount_minor,
      v_sel.currency,
      'Dry-run pilot prepare — no READY period created',
      v_ref,
      jsonb_build_object('pilot_label', v_label, 'preview', v_preview)
    );

    return jsonb_build_object(
      'ok', true,
      'dry_run', true,
      'allocated', false,
      'would_allocate_earning_item_id', v_sel.earning_item_id,
      'would_amount_minor', v_sel.amount_minor,
      'would_reject_other_eligible', true,
      'eligible_other_count', (v_preview->>'eligible_other_count')::int,
      'note', 'Dry-run passed — READY period not created'
    );
  end if;

  select coalesce(value_int, 0) = 1 into v_enabled
  from public.commercial_runtime_config
  where key = 'payout_pilot_prepare_enabled';

  if not coalesce(v_enabled, false) then
    return jsonb_build_object(
      'ok', false,
      'error', 'pilot_prepare_disabled',
      'note', 'Set payout_pilot_prepare_enabled=1 only after explicit pilot approval'
    );
  end if;

  v_period_key := to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD') || '-pilot-' || v_label;
  v_terms := public.supplier_active_commercial_terms(v_sel.supplier_id, now());
  v_cadence := coalesce(v_terms.payout_cadence, 'monthly');

  insert into public.supplier_payout_periods (
    supplier_id, currency, cadence, period_key, period_start, period_end,
    scheduled_for, status, amount_minor, item_count, note,
    threshold_snapshot_minor, threshold_enforced
  ) values (
    v_sel.supplier_id,
    v_sel.currency,
    v_cadence,
    v_period_key,
    (now() at time zone 'UTC')::date,
    (now() at time zone 'UTC')::date,
    (now() at time zone 'UTC')::date,
    'ready',
    0,
    0,
    'P8.3 pilot isolation READY · ' || v_label || ' · ' || v_ref,
    0,
    false
  )
  on conflict (supplier_id, currency, period_key) do nothing
  returning id into v_period_id;

  if v_period_id is null then
    select id into v_period_id
    from public.supplier_payout_periods
    where supplier_id = v_sel.supplier_id
      and currency = v_sel.currency
      and period_key = v_period_key;
    if v_period_id is not null then
      return jsonb_build_object('ok', false, 'error', 'duplicate_pilot_period', 'period_id', v_period_id);
    end if;
    return jsonb_build_object('ok', false, 'error', 'period_insert_failed');
  end if;

  update public.supplier_earning_items e
    set status = 'included',
        payout_period_id = v_period_id,
        updated_at = now()
  where e.id = v_sel.earning_item_id
    and e.status = 'eligible'
    and e.payout_period_id is null;

  if not found then
    update public.supplier_payout_periods
      set status = 'cancelled',
          note = coalesce(note || E'\n', '') || 'P8.3: cancelled — selected item allocate failed',
          updated_at = now()
    where id = v_period_id;
    return jsonb_build_object('ok', false, 'error', 'allocate_selected_failed');
  end if;

  insert into public.supplier_payout_period_items (period_id, earning_item_id, booking_id, amount_minor)
  values (v_period_id, v_sel.earning_item_id, v_sel.booking_id, v_sel.amount_minor)
  on conflict (earning_item_id) do nothing;

  select count(*)::int into v_other_moved
  from public.supplier_payout_period_items
  where period_id = v_period_id
    and earning_item_id is distinct from v_sel.earning_item_id;

  if v_other_moved > 0 then
    raise exception 'pilot_isolation_violation: extra items allocated';
  end if;

  update public.supplier_payout_periods
    set amount_minor = v_sel.amount_minor,
        item_count = 1,
        updated_at = now()
  where id = v_period_id;

  update public.supplier_payout_pilot_selections
    set status = 'consumed',
        updated_at = now(),
        note = coalesce(note || E'\n', '') || 'Consumed into period ' || v_period_id::text
  where id = v_sel.id;

  insert into public.financial_audit_log (
    actor_id, action, supplier_id, booking_id, amount_minor, currency, reason, provider_ref, after_state
  ) values (
    p_actor_id,
    'p83_pilot_prepare_executed',
    v_sel.supplier_id,
    v_sel.booking_id,
    v_sel.amount_minor,
    v_sel.currency,
    'Pilot READY period for approved pilot selection only',
    v_ref,
    jsonb_build_object(
      'period_id', v_period_id,
      'pilot_label', v_label,
      'earning_item_id', v_sel.earning_item_id,
      'item_count', 1
    )
  );

  return jsonb_build_object(
    'ok', true,
    'dry_run', false,
    'allocated', true,
    'period_id', v_period_id,
    'period_key', v_period_key,
    'amount_minor', v_sel.amount_minor,
    'item_count', 1,
    'earning_item_id', v_sel.earning_item_id,
    'stripe_transfer', false
  );
end;
$$;

revoke all on function public.prepare_supplier_payout_pilot(text, text, bigint, uuid, boolean) from public;
revoke all on function public.prepare_supplier_payout_pilot(text, text, bigint, uuid, boolean) from anon, authenticated;
grant execute on function public.prepare_supplier_payout_pilot(text, text, bigint, uuid, boolean) to service_role;
