# TRAVERION PHASE 1802 — Home discovery CTAs + destination tile polish

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

“All tours / All stays” were bare finland-colored text without tap targets or
hover feedback. Destination tiles zoomed the photo but had no lift/ring —
discovery felt flatter than mature OTAs.

## Fix

- New `.tv-section-cta` pill affordance (min-height, hover, focus, reduced-motion).
- Destination tiles: hover shadow + press scale; respect prefers-reduced-motion.

## Verification

- Vitest wiring cert.
- Visual: Home destinations + section CTAs.
