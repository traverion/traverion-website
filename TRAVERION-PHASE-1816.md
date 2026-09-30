# TRAVERION PHASE 1816 — Auth form panel coherence

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Traveler auth used a generic `tv-card`; partner auth used a flat bordered box —
two different account shells for the same product family.

## Fix

- Shared `.tv-auth-panel` with OTA paper depth.
- Partner form gains eyebrow + stronger display heading.

## Verification

- Vitest wiring cert.
- No auth logic / redirect changes.
