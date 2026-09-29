# TRAVERION PHASE 1711 — Partner shell must not wipe team JWTs

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Invited supplier teammates signed in on the partner portal, then `AuthProvider` immediately cleared their session. Pure partners on the partner shell were also at risk from the traveler “partner-only” wipe.

## Root cause

1. Phase 1082 traveler gate ran inside the partner shell (`App` wraps supplier area in `AuthProvider`) with no `isTraverionPartnerHost()` skip.
2. Authority used `fetchSupplierProfile`, which **resolves team → owner** (Phase 1202), so team JWTs without `consumer_profiles` looked partner-only and were wiped.

## Fix

- Skip `travelerUserAllowed` wipe on partner host.
- Traveler surfaces: `userHasSupplierProfile` (exact `id = uid`) for partner-only classification (sign-in + session restore + email-confirmed).

## Verification

- Vitest: AuthContext + EmailConfirmedSuccess wiring certs.
