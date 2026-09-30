# TRAVERION PHASE 1818 — Partner page hero coherence

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Partner page heroes used a washed slate eyebrow and short action targets;
modal headers lacked display type — inconsistent with the rest of the ops UI.

## Fix

- Finland eyebrow + stronger display H1.
- Hero actions enforce `min-h-11`.
- Modal titles use `font-display`.

## Verification

- Vitest wiring cert.
- Shared chrome only — no page logic changes.
