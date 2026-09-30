# TRAVERION PHASE 1811 — Calendar day-state visual language

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Calendar cells used one-off Tailwind state stacks that were hard to scan as a
shared operational language (available / full / occupied / editing).

## Fix

- Shared `.tv-cal-day*` state classes + `.tv-cal-legend`.
- Same semantic mapping as before; clearer inset rings and pressed motion.

## Verification

- Vitest wiring cert.
- No capacity/booking write logic changes.
