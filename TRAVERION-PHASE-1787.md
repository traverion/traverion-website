# TRAVERION PHASE 1787 — Check expire-booking-checkout invoke result

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Phase 1782 awaited `expire-booking-checkout` after unpaid cancel, but
`functions.invoke` does not throw on 401/403/function errors — only `{ error }` —
so a failed expire looked like success and left Checkout payable.

## Fix

Destructure `{ data, error }`; warn when `error` is set or `success === false`.
Cancel still succeeds; Stripe webhook still covers late captures.

## Verification

- Vitest wiring cert.
