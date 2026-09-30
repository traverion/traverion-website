# TRAVERION PHASE 1801 — Home hero brand-first hierarchy

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Home first viewport set TRAVERION and the headline at similar sizes (both
~`text-3xl` on mobile; headline larger on desktop). After removing the nav,
the viewport read like a generic travel slogan rather than a branded OTA.

## Fix

Scale TRAVERION to display-dominant (`text-5xl`→`7xl`) and demote the headline
to supporting voice (`text-xl`→`~1.75rem`). Shorten the subtitle for scanability.

## Verification

- Vitest wiring cert.
- Visual: Home first viewport in browser.
