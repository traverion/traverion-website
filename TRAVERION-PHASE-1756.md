# TRAVERION PHASE 1756 — Pickup cancel reason + listing editor deep-links

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Pickup gated most booking mutations for finance/viewer, but the unpaid cancel reason select stayed interactive and Edit meeting/schedule/pickup deep-links still opened the listing editor (silent RLS fail after 1744/1755).

## Fix

Disable cancel reason and listing-editor deep-links when `!canEditBookings`.

## Verification

- Vitest wiring cert.
