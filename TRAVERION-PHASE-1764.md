# TRAVERION PHASE 1764 — Expire unpaid checkout requires editor team roles

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

`expire-booking-checkout` treated any `supplier_team_members` row as supplier-side after notify (1759) already required editor roles. Finance/viewer JWTs could still expire Stripe Checkout sessions.

## Fix

Select `role`; require `supplierTeamRoleIsEditor` for the supplier path (traveler ownership unchanged).

## Verification

- Vitest wiring cert.
- Redeploy `expire-booking-checkout`.
