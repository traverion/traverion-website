# TRAVERION PHASE 1825 — StatusChip design system polish

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Status chips used one-off Tailwind rings that did not share the same accent
language as notices and ops cards.

## Fix

- Shared `.tv-status-chip*` tones.
- Tone mapping helpers unchanged.

## Verification

- Vitest wiring cert.
- Presentation only.
