# P9.46 — Traverion production launch readiness

| | |
|---|---|
| **Date** | 2026-11-19 |
| **Platform Stripe account** | `acct_1TFXp1CJawbWge6X` (LIVE, Traverion / EM Global Oy) |
| **Pilot supplier** | EM Global Oy `eced0f8c-c2e4-469b-8bba-15170be68cc1` |
| **Overall** | **BLOCKED on Stripe Platform profile** — Traverion-side launch path is otherwise prepared |
| **Production DB** | 1 verified (EM Global), 0 Connect IDs, 0 bookings, all money gates `0`, allowlist empty |
| **LIVE Stripe check** | Platform `acct_1TFXp1CJawbWge6X` confirmed Traverion / EM Global Oy; only Royal Nordic Express accounts exist (not EM) |

---

## PHASE 1 — LIVE Connect blocker (exact diagnosis)

### What fails

Authorized `ensure_account` (P9.45) with gate+allowlist open returned:

> Please review the responsibilities of collecting requirements for connected accounts  
> at https://dashboard.stripe.com/settings/connect/platform-profile

No EM Global Connect account was created. Gates were closed. **No further create retries until Dashboard state changes.**

### Why this exact error

Traverion’s Accounts v2 create body is intentionally marketplace-shaped:

| Property | Value |
|---|---|
| `dashboard` | `none` |
| `fees_collector` | `application` |
| `losses_collector` | `application` |
| Configuration | `recipient` + `stripe_transfers` (no merchant / card payments) |

Per Stripe docs, **platform collects KYC** only when `losses_collector=application` **and** `dashboard=none`. That requires LIVE Platform profile acknowledgment for **collecting requirements**.

This matches a marketplace using indirect charges (platform is MoR / loss liable). Changing to Express/`losses_collector=stripe` would avoid this acknowledgment but **changes risk and UX architecture** — not done without explicit product authorization.

### Correct LIVE platform

| Check | Evidence |
|---|---|
| Account | `acct_1TFXp1CJawbWge6X` |
| Company | EM Global Oy (FI) |
| Display | Traverion |
| Charges / payouts | enabled |
| Transfers capability | active |
| Statement descriptor | `TRAVERION ™` |

### Founder action required (LIVE mode only)

1. Open [Platform profile](https://dashboard.stripe.com/settings/connect/platform-profile) while **Live** (not Test).
2. Click **Acknowledge** on **every** responsibility item, especially **collecting requirements for connected accounts**.
3. Confirm **negative balance / loss liability** is assigned to the **platform** (marketplace requirement). If the UI still says Stripe is responsible for losses, contact Stripe Support to switch the platform profile so `dashboard: none` + platform liability is allowed.
4. Confirm [Platform setup](https://dashboard.stripe.com/settings/connect/platform-setup) shows approval to create live connected accounts.
5. Reply to authorize another **temporary** EM-only create window (same P9.45 procedure). Do not leave the gate open.

---

## PHASE 2 — One-form onboarding

| Item | Status |
|---|---|
| Single entry `/partner/onboarding` | **Operational** |
| Company → Documents → Representative → Payouts → Status | **Operational** |
| Profile reuse + soft director name suggest | **Operational** |
| Stripe return → Status sync | **Operational** (edge + UI) |
| Auto LIVE Connect create when eligible | **Blocked** by Phase 1 |

---

## PHASE 3 — Traverion-branded payments (this ship)

Supplier UI CTAs/labels moved to Traverion terms:

- Continue verification / Connect payouts / Payout verification  
- Legal Stripe Recipient Agreement + Privacy links **retained** where required  
- No claim that Traverion “is” the card processor; secure hosted verification still opens the payment provider when needed

---

## PHASE 4 — Real customer payments

| Item | Status |
|---|---|
| Checkout session + webhook finalization code | Present (`create-booking-checkout-session`, `stripe-webhook`) |
| Paid without genuine confirmation | Guarded in webhook/reconcile paths (prior certs) |
| Production bookings | **0** total / **0** paid |
| LIVE customer payment certification | **Not certified** (no controlled LIVE booking yet) |

---

## PHASE 5 — Commission & ledger

| Plan | Commission |
|---|---|
| Monthly | **15%** (1500 bps) |
| Twice-monthly | **18%** (1800 bps) |

Split helpers in `commercial-money.ts` are unit-tested. Production earnings/ledger reconciliation against LIVE charges: **pending** (no paid bookings).

---

## PHASE 6 — Supplier payout readiness

| Control | Value |
|---|---|
| `stripe_connect_transfers_enabled` | **0** |
| `payout_execution_enabled` | **0** |
| `payout_auto_prepare_enabled` | **0** |
| `payout_pilot_prepare_enabled` | **0** |
| Suppliers with Connect id | **0** |

Transfer/payout execution remains **OFF** until separate authorization after Connect exists.

---

## PHASE 7 — Booking operations

| Category | Notes |
|---|---|
| Tours / Stays | Checkout path exists; LIVE end-to-end unpaid in production DB |
| Rentals | Behind `RENTAL_CHECKOUT_ENABLED` kill-switch — **do not enable** without rental cert |

---

## PHASE 8 — Premium supplier UX

Shipped in P9.42–P9.44 + this branding pass: requirement progress, one primary Status CTA, completion states (submitted / pending / ready). Further visual polish continues after Connect unblocks.

---

## PHASE 9 — Monitoring & recovery

| Surface | Notes |
|---|---|
| Webhooks | LIVE Connect + payments destinations configured (prior missions) |
| Financial audit log | Create-window open/close audited (`p945_*`) |
| Admin verification | `admin-supplier-verification` + review events |

Silent money-movement failures: mitigated by execution flags at 0.

---

## PHASE 10 — Final LIVE certification matrix

| Journey | Status |
|---|---|
| 1. Supplier registration → business verification | **PASS** (EM Global verified) |
| 2. Approved supplier → LIVE Connect creation | **BLOCKED** (platform-profile) |
| 3. Connect onboarding → real verification status | **Blocked** (depends on 2) |
| 4. Listing → publication | Partial (draft/list UI; publish needs verified+payouts) |
| 5. Customer booking → real payment | **Not certified** (0 paid bookings) |
| 6. Cancellation → refund | Code present; LIVE cert pending |
| 7. Commission → earnings | Logic ready; LIVE data pending |
| 8. Payout eligibility → transfer readiness | Gates **OFF** by design |
| 9. Admin monitoring → reconciliation | Partial; needs LIVE volume |

---

## What is operational now

- Traverion business verification for a real Finnish company  
- Unified partner onboarding shell  
- Commission math (15% / 18%)  
- Safety: create/transfers/payouts/auto-prepare all **off**  

## What remains blocked

1. **Founder:** LIVE Platform profile acknowledgements (requirements collection + loss liability)  
2. **Then:** authorized EM Global Connect create + hosted verification  
3. **Then:** controlled LIVE customer payment + refund cert  
4. **Later:** transfer/payout execution authorization  

**Stop condition met:** genuine Stripe compliance / Dashboard acknowledgment required before Connect create can succeed. No fabricated KYC, payments, or gate flips.
