# TRAVERION PHASE 1805 — Mobile booking bar + quick facts polish

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Mobile sticky book bars were thin border-only strips with small sans price
text. Tour quick facts used a washed `/80` surface that read as unfinished.

## Fix

- Shared `.tv-booking-mobile-bar` with depth + blur.
- Display-type price on Tour/Stay mobile bars.
- Quick facts on solid paper with soft shadow.

## Verification

- Vitest wiring cert.
