# TRAVERION PHASE 1803 — Browse card title + price hierarchy

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Default-size listing cards used sans-semibold titles while compact cards used
`font-display` — catalog grids looked inconsistent. Price sat at `text-base`
and competed with meta lines.

## Fix

Always apply `font-display` to card titles; slightly enlarge the price row for
OTA-style scan hierarchy.

## Verification

- Vitest wiring cert.
- Visual: `/tours` browse cards.
