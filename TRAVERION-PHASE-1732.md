# TRAVERION PHASE 1732 — Review write RLS after force-unpublish

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Phase 1731 unlocked Leave a review for draft listings, but INSERT/UPDATE RLS still `JOIN listings` under traveler SELECT. Drafts are invisible (migration 141), so upsert failed after `review_request` / Trips CTA.

## Fix

Migration `212_traveler_may_write_review_unpublished.sql`: `traveler_may_write_review` SECURITY DEFINER loads booking+listing, keeps paid/ownership/experience/self-supplier gates, and powers insert/update policies without invoker-visible listing joins.

## Verification

- Vitest migration wiring cert.
- Apply migration 212 on Supabase.
