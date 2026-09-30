# TRAVERION PHASE 1807 — Listing creation progress & sticky footer

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Guided scene steppers only highlighted the current scene — completed scenes
looked identical to future ones. The sticky creation footer was a flat strip
without operational depth. Mobile progress lacked a glanceable track.

## Fix

- Scene progress: completed scenes show checkmarks; current uses an elongated
  finland pill.
- Sticky footer: frosted surface + lift shadow.
- Mobile creation bar: thin progress track under the step label.

## Verification

- Vitest wiring + existing scene progress a11y tests.
- No creation/publish logic changes.
