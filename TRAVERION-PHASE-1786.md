# TRAVERION PHASE 1786 — Reminder/review emails use auth email fallback

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

`send-booking-reminders` skipped experience reminders and review requests when
`guest_email` was empty — even when `guest_user_id` had a confirmed auth email.
Paid confirmation already resolved via `auth.admin.getUserById`; cron silently
dropped day-before / review mail for those rows.

## Fix

Resolve guest email via auth when the booking column is blank, select
`guest_user_id`, and backfill `guest_email` on success (parity with promote-paid).

## Verification

- Vitest wiring cert.
- Deploy: `send-booking-reminders`.
