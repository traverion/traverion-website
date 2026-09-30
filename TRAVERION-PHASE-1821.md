# TRAVERION PHASE 1821 — Listing gallery lightbox polish

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Tour/Stay photo lightboxes lacked prev/next controls and used a flat dark
overlay; “View all photos” was a plain underline link.

## Fix

- Shared `.tv-gallery-lightbox` with blur + circular nav buttons.
- Prev/Next on Tour and Stay; View all uses `tv-section-cta`.

## Verification

- Vitest wiring cert + stay gallery a11y smoke.
- Presentation only.
