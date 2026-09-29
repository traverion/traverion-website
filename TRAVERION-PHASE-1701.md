# TRAVERION PHASE 1701 — Contact / Support email journey

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Traveler Contact / Support (and Affiliate / Creator) forms did not deliver ops email.

## Root cause

1. **INSERT-only RLS on `contact_inquiries`:** client used `.insert().select('id')`. PostgREST RETURNING requires SELECT policy; none exists for anon/authenticated → insert may write a row but the client gets no id / error → **`notify-contact-inquiry` never invoked**.
2. **False success path:** even when notify was attempted, `submitContactInquiry` swallowed `functions.invoke` errors and still returned `{ success: true }`.

## Fix

- Migration **210**: `submit_contact_inquiry(...)` SECURITY DEFINER RPC returns uuid without public SELECT.
- Client calls RPC, then invokes `notify-contact-inquiry` with `{ inquiryId }`.
- UI success only if notify returns `success: true` (including idempotent skip).
- Copy updated: saved **and** team notified; still no promise of a reply email.

## Verification

- Vitest: notify success helper + RPC wiring certs; contact copy honesty tests.
- Apply migration 210 on the live Supabase project before verifying production Resend delivery.
- Env still required: `RESEND_API_KEY`, `CONTACT_INQUIRY_TO` (default info@traverion.com), `CONTACT_EMAIL_FROM` / `SUPPLIER_EMAIL_FROM`.
