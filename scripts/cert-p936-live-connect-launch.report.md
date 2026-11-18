# P9.36 — Traverion LIVE Connect Launch

| | |
|---|---|
| Verdict | **APPROVAL REQUIRED** — technical path ready; production create gate **not** enabled |
| Date | 2026-11-18 |
| Production project | `xcopqllkulxfkpunetbc` (Traverionapp) |
| Stripe account | Traverion LIVE (`acct_1TFXp1CJawbWge6X`) |
| Commit scope | Safety hardening + Stripe-hosted Account Link for Custom KYC |
| Gate changes this mission | **None** |

---

## Executive summary

Traverion can onboard a **single allowlisted** LIVE Connect supplier once humans complete business verification and authorize the create window. **EM Global Oy is not ready** (business still `rejected`; marketing poster on file). Transfers and payouts remain **disabled** by design.

This mission **did not** invent approvals, KYC, documents, payments, allowlist rows, or gate flips.

---

## 1. What is LIVE today

| Capability | Status |
|---|---|
| Platform Stripe money mode (`STRIPE_LIVE_PAYMENTS_ENABLED`) | **LIVE-capable** (secret present; platform can take traveler payments) |
| Checkout / booking payment capture | **LIVE-capable** (platform charge; no Connect `transfer_data` on checkout) |
| Connect webhook secrets (platform + Connect LIVE/TEST) | **Present** |
| `connect-supplier-onboarding` | **ACTIVE** — Accounts v2 create, status sync, Account Session, Account Link |
| `stripe-webhook` | **ACTIVE** — `account.updated` + Accounts v2 lifecycle → DB mirror |
| Commission / earnings accounting | **Present** (separate from bank payout execution) |

---

## 2. What is blocked (intentional)

| Control | Value | Notes |
|---|---|---|
| `live_custom_onboarding_enabled` | **0** | LIVE Connect **create** off for everyone |
| `live_custom_onboarding_allowlist` | **empty** | No supplier can create even if gate flipped alone |
| `stripe_connect_transfers_enabled` | **0** | No Connect transfers |
| `payout_execution_enabled` | **0** | No bank payout runs |
| `payout_auto_prepare_enabled` / `payout_pilot_prepare_enabled` | **0** | Keep off |
| `execute-supplier-transfers` | Hard-refuses non-TEST | Code block independent of DB flag |

---

## 3. EM Global Oy pilot candidate

| Field | Value |
|---|---|
| Supplier ID | `eced0f8c-c2e4-469b-8bba-15170be68cc1` |
| Legal name | EM Global Oy |
| Traverion business | **`rejected`** |
| Feedback | Registration file is a Royal Nordic marketing poster, not PRH/YTJ extract |
| `stripe_connected_account_id` | **null** |
| `live_accounts_v2_pilot_approvals` | **0 rows** |
| Eligibility | **NO-GO** until genuine extract + `approve_business` + pilot approval |

---

## 4. Technical improvements shipped (safe)

1. **LIVE create requires Traverion `verification_status = verified`** (edge).
2. **LIVE create requires `live_accounts_v2_pilot_approvals` row** in addition to allowlist + gate.
3. Status eligibility now reports `business_verified` / `pilot_approved` and blocks `live_create_allowed` accordingly.
4. **Stripe-hosted Account Link** exposed for Custom accounts with outstanding KYC (`fetchConnectAccountLink` + “Continue on Stripe”); status still only updates from Stripe sync/webhooks.
5. Unit cert: `src/lib/live-connect-launch-p936.cert.test.ts`.

---

## 5. Journey readiness (honest)

| Step | Ready? | Blocker |
|---|---|---|
| Supplier registration | Yes | — |
| Traverion business verification | Yes (P9.35 recovery) | EM Global needs real PRH extract |
| LIVE Connect create (pilot) | Code ready | Needs auth: verified + pilot approval + allowlist + gate=1 |
| Stripe KYC / hosted onboarding | Code ready | Needs real Connect account + Stripe responses |
| Persist account status | Yes (mirror + webhooks) | — |
| Booking + traveler payment | Platform LIVE-capable | Separate from Connect create |
| Commission accounting | Yes | — |
| Connect transfers → supplier | **Blocked** | Keep disabled until separate auth + cert |
| Bank payouts | **Blocked** | Keep disabled until separate auth + cert |

---

## 6. Explicit authorization checklist (DO NOT RUN until approved)

Reply with **AUTHORIZATION: P9.36 LIVE CREATE WINDOW** (or equivalent) only after:

1. Supplier uploads a **genuine PRH/YTJ extract** for EM Global Oy (`3567289-4`).
2. Admin **`approve_business`** after reviewing the extract (no bypass).
3. Admin records **`approve_live_v2_pilot`** with `ownerConfirmed` + `stripeVerificationAcknowledged` + `confirmLivePilot`.
4. Founder confirms willingness to create a **real LIVE** Accounts v2 connected account.
5. Confirm partner UI uses **`pk_live_…`** for bank tokenization on production.

Then ops (service role), in a short window:

```sql
insert into public.live_custom_onboarding_allowlist (supplier_id)
values ('eced0f8c-c2e4-469b-8bba-15170be68cc1');

update public.commercial_runtime_config
set value_int = 1, updated_at = now()
where key = 'live_custom_onboarding_enabled';
```

Supplier completes payout wizard → Connect create → Stripe-hosted KYC as needed → status sync.

**Immediately after create (or on anomaly):**

```sql
update public.commercial_runtime_config
set value_int = 0, updated_at = now()
where key = 'live_custom_onboarding_enabled';

delete from public.live_custom_onboarding_allowlist
where supplier_id = 'eced0f8c-c2e4-469b-8bba-15170be68cc1';
```

**Leave** `stripe_connect_transfers_enabled` and `payout_execution_enabled` at **0** until a later authorized mission.

---

## 7. Remaining blockers

1. EM Global business verification (real registration document).
2. Human **`approve_live_v2_pilot`** (not inventable).
3. Explicit founder authorization to open the LIVE create window.
4. Separate future authorization for transfers/payouts (out of scope for create-only pilot).
