# TRAVERION PHASE 1804 — Sticky booking card polish

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Listing sticky booking panels used the same soft card chrome as content
blocks; PriceHero amount was sans `text-2xl` — less purchase-ready than
mature OTAs’ booking rails.

## Fix

- Shared `.tv-booking-sticky` chrome (stronger depth, consistent padding).
- `PriceHero` amount uses `font-display` at a clearer size.
- Applied on Tour + Stay detail sticky panels.

## Verification

- Vitest wiring cert.
- Visual: tour detail sticky rail.
