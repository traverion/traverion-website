# TRAVERION PHASE 1814 — Shared empty/error state polish

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Empty and error primitives used slightly different icon chrome and spacing,
so edge states felt like leftover page chrome rather than one design system.

## Fix

- Shared `.tv-state-panel` / `__icon--empty|error`.
- Larger intentional icons; consistent action spacing + min tap height.

## Verification

- Vitest wiring cert.
- Presentation only; no copy/policy changes.
