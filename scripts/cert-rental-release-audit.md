# Traverion Rentals — Release Certification & Creator Recovery Audit

**Date:** 2026-10-27  
**Base:** `b71334cf` … current `origin/main`  
**Production project:** `xcopqllkulxfkpunetbc`  
**Staging cert project:** `gedktutbpfwnstcbffsc`  
**Public rental checkout:** still DISABLED on production  

## Phase 1 — Creator regression root cause

**Root cause:** The “33 screens” count was a misread of `rg -c "id: '"` over `rental-onboarding.ts`, which counted progress-group ids and `LEGACY_RENTAL_SCREEN_ALIASES` keys as well as live steps. The live registry had already been expanded from the intentional **19-screen** journey (`96cda38f`) to an interim **26-screen** split (item, highlights, return, daily-counting, accessibility, suitability, restrictions as separate steps) by later polish commits — not a full revert to the original 33-step registry.

**Fix:** Merged those interim splits back into focused screens while keeping all UI and validators:

| Merged away | Now lives on |
| --- | --- |
| `basics-item` | `basics-category` |
| `basics-highlights` | `basics-description` |
| `return-location` | `pickup-location` |
| `daily-counting` | `duration` |
| `accessibility`, `suitability` | `requirements` |
| `restrictions` | `inclusions` |

Draft resume: aliases in `LEGACY_RENTAL_SCREEN_ALIASES` map both the old 33-step ids and the interim 26-step ids onto the 19-screen journey.

**Final creator screen count: 19**

## Phase 2 — Real Stripe Checkout Session

Re-ran `node scripts/cert-rental-checkout-session.mjs` with `CERT_USE_HOSTED_CHECKOUT=0` (local Deno `RENTAL_CHECKOUT_ENABLED=1`) because staging secret write returned 403 for this account. Production flag remained unset.

**Result: PASS**

Evidence highlights (`scripts/cert-rental-checkout-session.report.json`):

- Checkout Session created + `tok_visa` payment pages confirm  
- Signed webhook processed (`checkout.session.completed`, `payment_intent.succeeded`)  
- Booking promoted confirmed/paid; hold confirmed  
- Duplicate webhook idempotent; concurrent last-unit one winner  
- Abandon / delayed payment / cancel-race refunds  
- Policy cancel + `execute-booking-refund` + Stripe refund succeeded  
- Production Stripe webhooks remained enabled before and after  

## Phase 3 — Notifications & operations

- Fresh checkout cert: confirmation/supplier/refund templates **captured** (staging log-only `skipped` — no live inbox spam).  
- Prior reliability cert (`scripts/cert-rental-reliability.report.json`, `ok: true`): real Resend **delivered** confirm + supplier mail; scoped `send-booking-reminders` sent pickup once and return once; cancelled booking did not remind; ops exceptions inbox exercised.  
- Re-run of reliability blocked this session by Supabase API-keys **403** (access-control); prior PASS evidence retained.

## Phase 4 — Tours / Stays regression

- Live stay Stripe cert against linked production DB blocked by the same Supabase **403** privilege regression (not a product regression).  
- Unit coverage re-run: orphan-checkout-refund, booking-lifecycle-calendar, inventory, pickup-completeness, payment-states (assertion updated to match current stay auto-refund copy).  
- `verify-stripe-env-isolation.mjs`: **PASS** (production rental flag absent; webhooks enabled; foreign project ignored).

## Remaining release blockers

1. Owner approval to set `RENTAL_CHECKOUT_ENABLED` on production (and lift publish gate 282) — **not done**.  
2. Staging `RENTAL_CHECKOUT_ENABLED` secret currently absent / not writable by this agent account (use local Deno path or restore staging secret with privileged role).  
3. Re-run stay/tour Stripe DB certs once Supabase linked DB / API-key privileges are restored.  
4. Optional: human smoke of the 19-screen creator (create → save → resume → preview) in the partner UI.

## Safety

- Production `RENTAL_CHECKOUT_ENABLED`: **absent**  
- Migration 282 publish gate: **intact** (cert fixture stayed draft)  
- No production Stripe credential changes  

## Verdict

**READY FOR OWNER APPROVAL** — creator restored to 19 screens; real Checkout Session + webhook + inventory/refund cert **PASS** on isolated staging/test isolation; public production rental payments remain closed pending explicit authorization.
