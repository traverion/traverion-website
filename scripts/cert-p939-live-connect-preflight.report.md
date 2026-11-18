# P9.39 — First LIVE Connect Activation Preflight

| | |
|---|---|
| **Verdict** | **NO-GO** |
| Date | 2026-11-18 |
| Production project | `xcopqllkulxfkpunetbc` (Traverionapp) |
| Stripe platform account | Traverion LIVE (`acct_1TFXp1CJawbWge6X` per prior P9.33/P9.36 audit) |
| Gate / allowlist / Connect create this mission | **None** — read-only |

---

## Executive summary

There is **no production supplier eligible** for first LIVE Connect activation today.

- **0** suppliers with Traverion `verification_status = verified`
- **0** rows in `live_accounts_v2_pilot_approvals`
- **0** rows in `live_custom_onboarding_allowlist`
- Create / transfers / payout / auto-prepare flags all remain **0**
- **0** connected Stripe accounts on supplier profiles

**Do not request LIVE create authorization.** Approving gates for an ineligible supplier would violate Traverion’s own create checks (`business_verified` + `pilot_approved` + allowlist + gate).

Closest real-entity candidate remains **EM Global Oy**, but it is **`rejected`** (marketing poster, not PRH extract). Synthetic cert suppliers are not LIVE KYC-ready.

---

## 1. Candidate inventory (production, this session)

| Supplier ID | Legal name | Status | Y-tunnus | Connect | LIVE-eligible? |
|---|---|---|---|---|---|
| `eced0f8c-c2e4-469b-8bba-15170be68cc1` | EM Global Oy | **rejected** | `3567289-4` (real YTJ) | None | **NO** — business not approved |
| `a912ec92-660c-4d6e-9438-4506107b0500` | P921 Test Supplier Oy | pending | `1234567-1` synthetic | None | **NO** — cert entity |
| `635efbf3-41c4-4a42-9039-4586f046c090` | P922 TEST Supplier Oy | pending | synthetic | None | **NO** — cert entity |
| `be0f0169-26c4-4d74-90b0-69328cb929a8` | P918 Arctic Tours Oy | pending | synthetic | None | **NO** — cert entity |
| `718ae3a5-ac82-4289-834e-a0ae960e3089` | P9161 Browser Legal Oy | pending | synthetic | None | **NO** — cert entity |

**Verified suppliers:** none.

### EM Global Oy evidence

| Check | Result |
|---|---|
| Auth email | `contact@royalnordic.fi` (confirmed) |
| Team role | `owner` (`user_id` = supplier id) |
| Country / type / phone | FI · company · `+358458803060` |
| YTJ open data (`3567289-4`) | Matches **EM Global Oy**, Siljotie 2 D 7, 96100 Rovaniemi |
| Registration document on file | `…/company-registration.png` |
| Traverion decision | **`rejected`** — feedback: marketing poster, not Trade Register extract |
| Pilot approval row | **Absent** |
| Allowlist | **Absent** |
| Connect account | **None** |

---

## 2. Money / create safety (must stay disabled)

| Control | Value (production query) | Required now |
|---|---|---|
| `live_custom_onboarding_enabled` | **0** | Keep **0** |
| `live_custom_onboarding_allowlist` | **0 rows** | Keep empty |
| `live_accounts_v2_pilot_approvals` | **0 rows** | N/A until verified supplier |
| `stripe_connect_transfers_enabled` | **0** | Keep **0** |
| `payout_execution_enabled` | **0** | Keep **0** |
| `payout_auto_prepare_enabled` | **0** | Keep **0** |
| `payout_pilot_prepare_enabled` | **0** | Keep **0** |
| `execute-supplier-transfers` | ACTIVE v10 — **hard-refuses non-TEST** | Independent of DB flag |

---

## 3. Stripe / webhook / permission audit (presence)

| Asset | Status |
|---|---|
| `STRIPE_SECRET_KEY` | Present |
| `STRIPE_LIVE_PAYMENTS_ENABLED` | Present |
| `STRIPE_ACCOUNT_ID` | Present |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Present (edge) — must remain `pk_live_…` for LIVE bank tokens after create |
| Platform webhook secrets (`STRIPE_WEBHOOK_SECRET`, `_LIVE`, `_TEST`) | Present |
| Connect webhook secrets (`_CONNECT_LIVE`, `_CONNECT_TEST`) | Present |
| `connect-supplier-onboarding` | **ACTIVE** v33 — Accounts v2 create gated; `account_link` hosted KYC |
| `stripe-webhook` | **ACTIVE** v116 — Connect mirror path |
| Client provision | `canProvisionConnectAccount` requires `live_create_allowed` on LIVE |
| Wizard | `fetchConnectAccountLink` wired (P9.38) for authorized suppliers only |

Technical path for Stripe-hosted onboarding is **code-ready**. Journey cannot be completed for a real supplier until Traverion business verification + pilot approval exist.

---

## 4. Rollback controls (ready, unused)

If a future authorized create window is opened:

```sql
update public.commercial_runtime_config
set value_int = 0, updated_at = now()
where key = 'live_custom_onboarding_enabled';

delete from public.live_custom_onboarding_allowlist
where supplier_id = '<authorized-supplier-uuid>';
```

Keep transfers / payout execution / auto-prepare at **0**. Closing the gate does not delete a Stripe account that was already created.

---

## 5. Exact allowlist / gate changes required later

**Not authorized now.** When — and only when — a supplier is Traverion-`verified`, has a genuine registration extract, and has a recorded LIVE v2 pilot approval (`owner_confirmed` + `stripe_verification_acknowledged`):

```sql
-- 1) Allowlist ONLY that verified supplier (service role)
insert into public.live_custom_onboarding_allowlist (supplier_id)
values ('<verified-supplier-uuid>');

-- 2) Controlled create window
update public.commercial_runtime_config
set value_int = 1, updated_at = now()
where key = 'live_custom_onboarding_enabled';
```

Then supplier completes Income & Payouts → Connect create → Stripe-hosted Account Link as needed → close gate immediately.

**Do not use** EM Global’s UUID until business status is **`verified`** after a real PRH/YTJ extract review.

**Do not use** P921/P922/P918/P9161 for LIVE create (synthetic registration numbers cannot pass genuine Stripe LIVE KYC).

---

## 6. Path to GO (supplier work, not gate flips)

For EM Global Oy (only real-entity candidate today):

1. Supplier uploads an **official PRH/YTJ company extract** (PDF/clear scan).
2. Admin reviews and runs genuine **`approve_business`** (no bypass).
3. Admin records **`approve_live_v2_pilot`** with real owner + Stripe acknowledgement.
4. Founder issues explicit LIVE create-window authorization naming that supplier id.
5. Then — and only then — apply the allowlist + gate SQL above for a short window.

Until step 2 succeeds, **P9.39 remains NO-GO**.

---

## 7. Safe improvements this mission

- Added production read-only cert: `scripts/cert-p939-live-connect-preflight.mjs`
- Added unit cert: `src/lib/live-connect-preflight-p939.cert.test.ts`
- No financial gates changed; no Connect accounts created; no allowlist writes

---

## Final GO / NO-GO matrix

| Gate | Result |
|---|---|
| Eligible verified supplier identified | **FAIL** — none |
| Business approval | **FAIL** — EM rejected; others pending/synthetic |
| Pilot authorization recorded | **FAIL** — 0 rows |
| Owner / Stripe acknowledgement | **FAIL** — not recorded |
| Stripe LIVE secrets / webhooks / onboarding fn | **PASS** (presence) |
| Transfers / payouts / auto-prepare disabled | **PASS** |
| Create gate + allowlist off | **PASS** |
| Request LIVE create approval now? | **NO** |

### **VERDICT: NO-GO**

Re-run P9.39 after a supplier reaches Traverion `verified` with genuine evidence. Do not authorize gates for EM Global while `rejected`, and do not nominate cert suppliers for LIVE.
