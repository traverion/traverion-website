# 01 — Executive Summary

**Audit date:** 2026-10-22  
**Product:** Traverion — travel marketplace (tours/activities + stays)  
**Stack:** Vite React SPA · Supabase (Auth, Postgres, RLS, Edge Functions) · Stripe Checkout (TEST-gated) · Vercel hosting · Resend transactional email (wired; mailbox delivery not re-proven here)

---

## Overall maturity

Traverion is a **substantially built, commercially oriented marketplace** with deep booking/inventory/payment machinery—not a prototype UI. Most consumer, supplier, and admin surfaces exist and are wired to Supabase/Stripe edge paths.

**Production-readiness verdict (this audit):**

> **NOT SAFE FOR REAL-MONEY / LIVE STRIPE CUSTOMERS YET.**  
> **CONDITIONALLY READY for controlled Stripe TEST supplier demos** after owner confirms email delivery, commission/payout policy, and a formal TEST certification pass.

Method for estimates below:  
- **Code coverage** = workflows present end-to-end in client + edge + SQL  
- **Verified** = exercised in this audit (vitest subset / local browser / explicit prior-session browser)  
- Remaining = **IMPLEMENTED / UNVERIFIED** unless marked PARTIAL/UI ONLY/BROKEN

| Domain | Code coverage (est.) | Verified in this audit | Confidence |
|--------|---------------------:|-----------------------:|------------|
| Consumer marketplace UI & browse | ~85% | ~25% (local homepage smoke) | Medium |
| Consumer checkout → paid booking | ~90% (TEST path) | ~5% (unit/contract only) | Medium-high on code, low on runtime |
| Supplier portal operations | ~85% | ~0% runtime | Medium |
| Admin control center | ~80% | ~0% runtime | Medium |
| Booking / payments / finance engine | ~88% Instant Book; ~85% R2B; ~60% refunds-to-Stripe | ~10% (selected vitest) | Medium-high on Instant Book design |
| Infrastructure (CI crons, hosts, secrets patterns) | ~75% | Partial (workflow files present) | Medium |

---

## Major completed systems (code)

1. **Host-split marketplace**: traveler (`www`), partner (`partner.`), admin (`admin.`) via `vercel.json` + App routing  
2. **Published catalog discovery**: Home, Tours, Stays, Destination pages with real listing-backed covers when available  
3. **Tour PDP + sticky booking + BookingPage → create-booking-checkout-session**  
4. **Stay PDP + calendar occupancy + Instant Book / Request-to-Book UI**  
5. **Atomic paid promotion** (`promote_paid_checkout_booking`) with orphan/conflict auto-refund paths  
6. **Stay R2B authorize/accept/capture/expire** (migrations 252–257 + edge functions + GH cron)  
7. **Supplier listings / availability / bookings / pickup planner / inbox / earnings UI**  
8. **Admin verification, bookings, finance visibility, content reports** (edge `assertAdmin`)  
9. **Large vitest contract suite** (~589 test files) guarding money/inventory honesty  

---

## Major incomplete / weak systems

| Gap | Severity | Notes |
|-----|----------|-------|
| Stripe LIVE blocked; commercial take-rate still 0% MoR model | P0/P1 | Fine for TEST demos; not a finished LIVE business model |
| Traveler/partner cancel → “Refund due” without auto Stripe refund | P1 | By design in mig 241/256; ops must execute manually |
| Email mailbox delivery | P1 | Wired + idempotent; external delivery NOT VERIFIED here |
| Stripe Connect / automatic payouts | P1 | Manual admin “record payout” only |
| Analytics productization | P2 | `src/lib/analytics.ts` stub |
| Team invite UX | P2 | Coming Soon; memberships exist |
| Multi-unit stays / rentals | P2/NA | Explicitly blocked from publish / UI ONLY |
| Cart multi-item commerce | P2 | Soft-retired; residual open-checkout page |
| Full Lighthouse / partner/admin E2E in this audit | P1 certification | NOT VERIFIED |
| Money UI contract drift | P2 | `commercial-money-engine-v1.test.ts` failed on payout copy |

---

## Top risks

1. **Money out of band:** Refund due / prepared refund instructions without automated Stripe execute → human error, delayed customers  
2. **R2B capture-then-finalize gap:** Stripe capture can succeed before DB finalize (recovery via webhook; still ops risk)  
3. **Concurrent Instant Book races:** First promote wins + auto-refund losers — correct design, must be TEST-certified under load  
4. **Email as operational dependency:** Soft-fail honesty exists, but suppliers may miss bookings if Resend/domain misconfigured  
5. **Admin marketplace wipe / privileged actions:** Powerful; must remain tightly allowlisted (`public.admin`)  
6. **Unverified LIVE readiness:** LIVE keys intentionally 503 — good safety, but implies LIVE launch is a separate program  

---

## Highest-priority next actions

1. Run **Stripe TEST launch certification matrix** (tour Instant Book, stay Instant Book, stay R2B accept/decline/expire, cancel+manual refund, webhook replay)  
2. Prove **Resend** customer + supplier mailbox delivery for paid/cancel/message  
3. Decide and document **commission + payout** policy before LIVE  
4. Fix or update **earnings UI contract tests** (`Eligible for next payout` drift)  
5. Owner checklist: env secrets, GH Action secrets for crons, admin allowlist, legal pages accuracy  

See `09-LAUNCH-BLOCKERS.md` and `10-DEVELOPMENT-ROADMAP.md`.
