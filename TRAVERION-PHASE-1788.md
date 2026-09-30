# TRAVERION PHASE 1788 — Auth email fallback for booking-tied traveler mail

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Cancel, schedule, pickup-note, and details emails skipped when `guest_email` was
blank — even for account-bound bookings with `guest_user_id`. Reminder cron
already resolved auth email (1786); cancel/schedule did not.

## Fix

1. `notify-customer-booking` resolves/backfills guest email via
   `auth.admin.getUserById` before recipient fail-closed.
2. Client invoke paths no longer gate on non-empty `guest_email`.

## Verification

- Vitest wiring cert.
- Deploy: `notify-customer-booking`.
