-- Admin marketplace wipe: truncate marketplace data (service_role / admin edge only).
-- Auth user deletion stays in the edge function (Auth Admin API).

create or replace function public.admin_marketplace_wipe(p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
  v_truncated text[] := array[
    'supplier_payout_period_items',
    'supplier_payout_periods',
    'supplier_earning_items',
    'booking_commercial_snapshots',
    'booking_refund_instructions',
    'booking_financial_holds',
    'booking_dispute_events',
    'booking_payment_events',
    'supplier_ledger_entries',
    'cancellation_requests',
    'booking_messages',
    'reviews',
    'content_reports',
    'bookings',
    'listing_images',
    'listing_availability',
    'listings',
    'supplier_team_members',
    'supplier_commercial_terms',
    'supplier_portal_notifications',
    'supplier_export_runs',
    'supplier_earnings',
    'supplier_profiles',
    'consumer_profiles',
    'contact_inquiries'
  ];
  v_done text[] := array[]::text[];
  v_skipped text[] := array[]::text[];
  v_n bigint;
begin
  if btrim(coalesce(p_confirm, '')) <> 'RESET MARKETPLACE' then
    return jsonb_build_object('ok', false, 'error', 'confirm_required');
  end if;

  foreach v_table in array v_truncated
  loop
    begin
      execute format('truncate table public.%I restart identity cascade', v_table);
      v_done := array_append(v_done, v_table);
    exception
      when undefined_table then
        v_skipped := array_append(v_skipped, v_table);
      when others then
        v_skipped := array_append(v_skipped, v_table || ':' || SQLERRM);
    end;
  end loop;

  begin
    delete from public.financial_audit_log;
    get diagnostics v_n = row_count;
  exception
    when undefined_table then
      v_n := 0;
  end;

  begin
    insert into public.financial_audit_log (actor_id, action, reason, after_state)
    values (
      null,
      'marketplace_wipe_sql',
      'admin_marketplace_wipe truncated marketplace tables',
      jsonb_build_object(
        'confirm', 'RESET MARKETPLACE',
        'truncated', v_done,
        'skipped', v_skipped,
        'audit_cleared', v_n,
        'at', now()
      )
    );
  exception
    when undefined_table then
      null;
  end;

  return jsonb_build_object(
    'ok', true,
    'truncated', to_jsonb(v_done),
    'skipped', to_jsonb(v_skipped),
    'note', 'Auth users must be deleted separately via Admin API (keep info.traverion@gmail.com).'
  );
end;
$$;

comment on function public.admin_marketplace_wipe(text) is
  'Destructive TEST wipe of marketplace tables. service_role only. Does not delete auth.users.';

revoke all on function public.admin_marketplace_wipe(text) from public;
revoke all on function public.admin_marketplace_wipe(text) from anon, authenticated;
grant execute on function public.admin_marketplace_wipe(text) to service_role;
