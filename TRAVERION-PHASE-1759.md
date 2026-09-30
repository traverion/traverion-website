# TRAVERION PHASE 1759 — Notify team auth requires editor roles

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

After UI/RLS editor locks, `notify-customer-booking` and `notify-supplier-event` still treated any `supplier_team_members` row as full supplier-side — finance/viewer JWTs could fire host email kinds and set caller `fieldDiffs`.

## Fix

Select `role` on team lookup; only `owner|manager|ops` count as supplier-side (`supplierTeamRoleIsEditor`). Same gate for verification_submitted / welcome self-notify.

## Verification

- Vitest helper + edge wiring.
- Redeploy both notify functions.
