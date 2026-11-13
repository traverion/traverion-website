-- B2B ALL-SYSTEMS: mig 300 replaced booking_blocks_payout_eligibility without
-- re-applying EXECUTE grants, leaving anon able to call a security definer helper.
-- Align with payout gate helpers (301): service_role only. No client calls this RPC.

revoke all on function public.booking_blocks_payout_eligibility(uuid) from public;
revoke all on function public.booking_blocks_payout_eligibility(uuid) from anon, authenticated;
grant execute on function public.booking_blocks_payout_eligibility(uuid) to service_role;
