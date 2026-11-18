# P9.44 — One-form onboarding + Stripe LIVE Connect

| | |
|---|---|
| **Date** | 2026-11-18 |
| **Production** | `xcopqllkulxfkpunetbc` |
| **Supplier** | EM Global Oy `eced0f8c-c2e4-469b-8bba-15170be68cc1` |
| **Transfers / payouts / auto-prepare** | **Unchanged (0)** |

---

## UX shipped

- `/partner/onboarding` remains the single setup shell (Company → Documents → Representative → Payouts → Status).
- Stripe Account Link **return/refresh** now lands on `/partner/onboarding?phase=status&connect=…` and syncs status.
- Soft-reuses company + single-director name for representative (never invents DOB / ownership / bank).
- Gate / pilot / create blocks mapped to short supplier instructions.
- Status completion distinguishes **Setup submitted**, **Verification pending**, and **Ready to receive payouts**.
- One primary Status CTA (`Continue with Stripe` when an account exists and KYC remains).

Edge `connect-supplier-onboarding` redeployed with return URLs + supplier-facing create-block copy.

---

## LIVE create window (controlled)

### Prerequisites revalidated

| Check | Result |
|---|---|
| Traverion `verification_status` | **verified** |
| Registration document | PRH extract on file |
| LIVE v2 pilot (`owner_confirmed` + Stripe ack) | **yes** |
| Existing Connect account | **none** (before attempt) |
| Transfers / payouts | **0** |

### Authorization applied

P9.44 authorized a **temporary** allowlist + `live_custom_onboarding_enabled=1` for this supplier only, then mandatory close.

### Attempt

1. Opened allowlist + gate (audited `p944_live_create_window_opened`).
2. Supplier session `ensure_account` called (idempotent claim path).
3. Stripe refused Accounts v2 create:

> Please review the responsibilities of collecting requirements for connected accounts at `https://dashboard.stripe.com/settings/connect/platform-profile`.

4. Create window **closed** immediately (gate `0`, allowlist empty). Transfers/payouts untouched.

### Remaining blocker (human Stripe Dashboard)

Acknowledge Connect **Platform profile** responsibilities in LIVE Stripe:

`https://dashboard.stripe.com/settings/connect/platform-profile`

Then re-open the same controlled window and re-run `ensure_account` / Account Link. No Traverion gate should stay open while that Dashboard step is pending.

---

## Safety snapshot after attempt

| Control | Value |
|---|---|
| `live_custom_onboarding_enabled` | **0** |
| allowlist | **0** |
| `stripe_connect_transfers_enabled` | **0** |
| `payout_execution_enabled` | **0** |
| EM Global `stripe_connected_account_id` | **null** |

---

## Verdict

| Area | Result |
|---|---|
| One-form UX + return path | **PASS** (code + edge deployed) |
| Controlled create window open/close | **PASS** (audited; closed on failure) |
| First LIVE Connect account for EM Global | **BLOCKED** — Stripe platform-profile acknowledgment |
| Transfers / payouts | **OFF** (as required) |
