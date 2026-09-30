# TRAVERION PHASE 1806 — Trips itinerary card polish

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Trips cards read like database rows: sans titles, flat price line, weak expand
chrome. Home “All stays” still used the pre–Phase 1802 link style.

## Fix

- Shared `.tv-trip-card` / `__facts` for itinerary document chrome.
- Display typography on titles and collected amounts.
- Clearer open-state depth; smoother chevron; denser fact labels.
- Home stays CTA aligned to `tv-section-cta`.

## Verification

- Vitest wiring cert.
- No booking/payment logic changes.
