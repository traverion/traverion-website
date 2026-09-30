# TRAVERION PHASE 1796 — Host cancel-request auth email fallback

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Host cancel-request skipped traveler notify when `guest_email` was blank —
Accept/Decline already used auth fallback (1788).

## Fix

Always invoke `notifyTravelerCancellationRequest` with resolve placeholder when
email is blank; edge resolves via `guest_user_id`.

## Verification

- Vitest wiring cert.
