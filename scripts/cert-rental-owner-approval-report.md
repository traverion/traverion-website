# Traverion Rentals — Owner Approval Report

**Date:** 2026-10-27  
**Baseline:** `6ee0e3ed`  
**This delivery commit:** _(filled after push)_  
**Production:** `xcopqllkulxfkpunetbc` — `RENTAL_CHECKOUT_ENABLED` remains **OFF** (capability probe)  
**Staging:** `gedktutbpfwnstcbffsc` — hosted checkout flag **ON** (capability probe)  
**Publication gate 282:** intact (cert fixtures stayed draft)

---

## 1. Verified and passing

| Phase | Result | Evidence |
| --- | --- | --- |
| **P1 Access diagnosis** | **PASS** (root cause identified) | CLI authenticated to **Royal Nordic** org only → Management API 403 on Traverion refs. Staging `CERT_*` app credentials still work. Doc: `scripts/cert-supabase-access-diagnosis.md` |
| **P2 Hosted Checkout Session** | **PASS** | `CERT_USE_HOSTED_CHECKOUT=1 node scripts/cert-rental-checkout-session.mjs` → `ok: true`. Hosted URL `…gedktutbpfwnstcbffsc…/create-booking-checkout-session`. Webhook events processed (`checkout.session.completed` `evt_1UVGlIC…`, PI `pi_3UVGlHC…`). Booking `TV-SFLW5T4C` confirmed/paid; hold confirmed; concurrent last-unit one winner; refund `re_3UVGlHC…` idempotent. Report: `scripts/cert-rental-checkout-session.report.json` |
| **P2 Inventory / races** | **PASS** | Abandon release, delayed payment refund, cancel-vs-promote refund, concurrent claim — all ok in same report |
| **P2 Stripe isolation** | **PASS** | `verify-stripe-env-isolation.mjs` PASS; production webhooks remained enabled; cross-env no production refund |
| **P3 Creator logic smoke** | **PASS** | 19 screens; draft aliases; blockers — `src/lib/rental-creator-smoke.test.ts` (4/4). Public `/rentals` catalog loads |
| **P4 Unit / publish gate** | **PASS** | orphan-checkout-refund, lifecycle calendar, payment-states, inventory, listingPublishGate, creator smoke |
| **Production flag** | **PASS (closed)** | Capability probe → `rentalCheckoutEnabled: false` |

---

## 2. Blocked by infrastructure or credentials

| Item | Status | Why |
| --- | --- | --- |
| Supabase Management API (`secrets list`, `api-keys`, `db query --linked`) | **BLOCKED** | CLI logged into Royal Nordic, not Traverion org. Staging app certs do not need this once capability probes + `CERT_*` keys are used. |
| Authenticated 19-screen Partner creator browser smoke (desktop/mobile create→save→resume→preview) | **BLOCKED** | `/partner` redirects to login; no partner test credentials in this session |
| Fresh `cert-rental-reliability.mjs` re-run (Resend delivery + scheduled reminders against production-linked DB) | **BLOCKED** | Needs Traverion CLI login **or** `SUPABASE_SERVICE_ROLE_KEY` in local env for production project; `--linked` DB also 403 under wrong org |
| Prior reliability PASS (delivered mail + pickup/return reminders) | **NOT RE-EXECUTED** | Retained evidence only: `scripts/cert-rental-reliability.report.json` (`ok: true`) from earlier run |

Checkout-session `notification_smoke` captured templates as staging **skipped** (log-only), not live Resend delivery.

---

## 3. Known remaining risks

1. Hosted staging notifications are log-only / skipped — production email path not re-proven this session.  
2. Partner creator UX on real devices not exercised under login.  
3. Tours/Stays live Stripe DB certs not re-run (linked production DB Management API 403). Isolation unit tests passed.  
4. Enabling public rental checkout still requires separate owner authorization (flag + publish gate 282).

---

## 4. Actions requiring owner authorization

**A. Restore Traverion CLI access (recommended, no production change):**
```bash
npx supabase logout
npx supabase login   # Traverion account
npx supabase orgs list   # expect Traverion org, not only Royal Nordic
npx supabase projects list  # expect xcopqllkulxfkpunetbc + gedktutbpfwnstcbffsc
```

**B. Do NOT enable public rental checkout without a separate explicit decision.**  
Do not set `RENTAL_CHECKOUT_ENABLED=1` on production. Do not lift migration 282.

**C. Optional:** Provide a staging partner login for authenticated creator UI smoke, or run that smoke yourself after (A).

---

## Verdict

**Hosted Stripe Checkout certification: PASS.**  
**Public production rental checkout: still DISABLED — not authorized to launch.**  

Overall for *owner approval to enable production*: **BLOCKED** pending (1) Traverion CLI re-login for any remaining linked/production certs you want refreshed, and (2) explicit authorization to turn on the production flag / publish gate.  

Overall for *accepting staging hosted checkout as proven*: **PASS**.
