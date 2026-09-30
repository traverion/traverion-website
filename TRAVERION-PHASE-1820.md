# TRAVERION PHASE 1820 — Skeleton shimmer polish

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Loading skeletons used plain opacity pulse — functional but not the OTA
“perceived speed” language used by mature marketplaces.

## Fix

- Shared `.tv-skeleton` shimmer gradient.
- Respects `prefers-reduced-motion` (static fill).

## Verification

- Vitest wiring cert.
- Presentation only.
