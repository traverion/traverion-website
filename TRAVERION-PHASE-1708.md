# TRAVERION PHASE 1708 — Wishlist Save/heart auth resume

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Anon Save/heart → AuthModal sign-in → traveler signed in but listing never saved (browse, tour detail, stay detail).

## Root cause

Same race as Phase 1704 checkout: `onSuccess` ran before React `user` updated; wishlist `run()` read null `userRef` and returned; per-render `userRef.current = user` wiped any mid-flight session on modal close.

## Fix

- `useTravelerWishlist`, `TourDetails`, `StayDetails` wishlist: effect-only `userRef` sync; `getSession()` hydrate in auth `onSuccess` before `toggleWishlist`.
- Gate on `userRef`, not stale React `user`.

## Verification

- Vitest: `wishlist-auth-resume-1708.test.ts`
