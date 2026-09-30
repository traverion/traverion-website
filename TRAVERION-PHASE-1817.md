# TRAVERION PHASE 1817 — Analytics metric hierarchy

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Analytics used flat bordered metric boxes and tiny listing revenue lines —
readable but not OTA ops console hierarchy.

## Fix

- Shared `.tv-metric-tile` with display values.
- “By listing” section uses display heading + larger revenue + touch-safe actions.

## Verification

- Vitest wiring cert.
- Presentation only — no analytics math changes.
