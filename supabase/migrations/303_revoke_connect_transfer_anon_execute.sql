-- PREPARED / NOT YET APPROVED FOR PRODUCTION APPLY.
-- Follow-up to 302: Connect transfer + recovery helpers still had anon EXECUTE
-- after CREATE OR REPLACE without revoke (same class of regression as booking_blocks).
-- Triggers are left untouched. supplier_period_earnings keeps authenticated (supplier UI).

revoke all on function public.supplier_connect_transfer_preflight(uuid, uuid) from public;
revoke all on function public.supplier_connect_transfer_preflight(uuid, uuid) from anon, authenticated;
grant execute on function public.supplier_connect_transfer_preflight(uuid, uuid) to service_role;

revoke all on function public.reserve_supplier_transfer_attempt(uuid, uuid, integer) from public;
revoke all on function public.reserve_supplier_transfer_attempt(uuid, uuid, integer) from anon, authenticated;
grant execute on function public.reserve_supplier_transfer_attempt(uuid, uuid, integer) to service_role;

revoke all on function public.list_due_connect_transfer_periods(timestamptz, integer) from public;
revoke all on function public.list_due_connect_transfer_periods(timestamptz, integer) from anon, authenticated;
grant execute on function public.list_due_connect_transfer_periods(timestamptz, integer) to service_role;

revoke all on function public.compute_platform_transferable_minor(text, bigint, bigint, bigint) from public;
revoke all on function public.compute_platform_transferable_minor(text, bigint, bigint, bigint) from anon, authenticated;
grant execute on function public.compute_platform_transferable_minor(text, bigint, bigint, bigint) to service_role;

revoke all on function public.commercial_record_post_payout_recovery(uuid, bigint, text) from public;
revoke all on function public.commercial_record_post_payout_recovery(uuid, bigint, text) from anon, authenticated;
grant execute on function public.commercial_record_post_payout_recovery(uuid, bigint, text) to service_role;

revoke all on function public.commercial_unlink_earning_from_unpaid_periods(uuid) from public;
revoke all on function public.commercial_unlink_earning_from_unpaid_periods(uuid) from anon, authenticated;
grant execute on function public.commercial_unlink_earning_from_unpaid_periods(uuid) to service_role;

revoke all on function public.phase5_sync_earnings_after_reschedule(uuid, uuid) from public;
revoke all on function public.phase5_sync_earnings_after_reschedule(uuid, uuid) from anon, authenticated;
grant execute on function public.phase5_sync_earnings_after_reschedule(uuid, uuid) to service_role;

-- Supplier Money UI calls this as authenticated; anon must not.
revoke all on function public.supplier_period_earnings(uuid, timestamptz, timestamptz, text) from public;
revoke all on function public.supplier_period_earnings(uuid, timestamptz, timestamptz, text) from anon;
grant execute on function public.supplier_period_earnings(uuid, timestamptz, timestamptz, text) to authenticated, service_role;
