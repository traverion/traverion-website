-- B2B.9.5: Revoke anon/authenticated EXECUTE on payout include-gate helpers (service_role only).
-- B2B.9.5: fail-closed EXECUTE grants for payout gate helpers (service_role only).
-- supplier_attest remains authenticated + service_role.

revoke all on function public.booking_ledger_reconcile_flags(uuid) from public;
revoke all on function public.booking_ledger_reconcile_flags(uuid) from anon, authenticated;
grant execute on function public.booking_ledger_reconcile_flags(uuid) to service_role;

revoke all on function public.booking_payout_include_blocked_reasons(uuid) from public;
revoke all on function public.booking_payout_include_blocked_reasons(uuid) from anon, authenticated;
grant execute on function public.booking_payout_include_blocked_reasons(uuid) to service_role;

revoke all on function public.booking_payout_include_allowed(uuid) from public;
revoke all on function public.booking_payout_include_allowed(uuid) from anon, authenticated;
grant execute on function public.booking_payout_include_allowed(uuid) to service_role;

-- prepare_due should already be service_role-only; reassert.
revoke all on function public.prepare_due_supplier_payouts(timestamptz) from public;
revoke all on function public.prepare_due_supplier_payouts(timestamptz) from anon, authenticated;
grant execute on function public.prepare_due_supplier_payouts(timestamptz) to service_role;

revoke all on function public.refresh_supplier_earning_eligibility(timestamptz) from public;
revoke all on function public.refresh_supplier_earning_eligibility(timestamptz) from anon, authenticated;
grant execute on function public.refresh_supplier_earning_eligibility(timestamptz) to service_role;

revoke all on function public.booking_is_tour(uuid) from public;
revoke all on function public.booking_is_tour(uuid) from anon;
-- keep authenticated for supplier UI helpers if needed; still fail-closed for financial include gates.
grant execute on function public.booking_is_tour(uuid) to authenticated, service_role;
