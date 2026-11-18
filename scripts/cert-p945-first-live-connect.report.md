# P9.45 — First Stripe LIVE Connect account

| | |
|---|---|
| **Date** | 2026-11-18 |
| **Supplier** | EM Global Oy `eced0f8c-c2e4-469b-8bba-15170be68cc1` |
| **Authorization** | User-authorized temporary create gate + EM-only allowlist |
| **Verdict** | **FAIL — Stripe platform-profile still blocks Accounts v2 create** |

---

## Real Stripe result

Authorized window opened → Traverion `live_create_allowed: true` → supplier `ensure_account` called.

**Stripe error (unchanged from P9.44):**

> Please review the responsibilities of collecting requirements for connected accounts at  
> https://dashboard.stripe.com/settings/connect/platform-profile

| Outcome | Value |
|---|---|
| EM Global `stripe_connected_account_id` | **null** (no account created) |
| Idempotent reuse | N/A — create never succeeded |
| Account Link | Not started (no account) |

Traverion creates Accounts v2 recipients with `dashboard: none` and `losses_collector` / `fees_collector: application`. Per Stripe docs, that configuration makes the **platform** the KYC requirements collector — which requires the LIVE Platform profile acknowledgment for collecting requirements.

Platform account `acct_1TFXp1CJawbWge6X` (Traverion / EM Global Oy) is otherwise live: charges + payouts enabled. The blocker is specifically Connect Platform profile responsibilities for **requirements collection**, not Traverion gates.

---

## Window lifecycle (authorized)

| Step | Result |
|---|---|
| Revalidate verified + pilot + FI + money gates off | **PASS** |
| Confirm no prior EM Global Connect account | **PASS** |
| Open allowlist (EM only) + `live_custom_onboarding_enabled=1` | **Done** (audited `p945_live_create_window_opened`) |
| `ensure_account` | **FAIL** — Stripe platform-profile |
| Close allowlist + gate | **Done immediately** (audited `p945_live_create_window_closed`) |

---

## Final gate state

| Control | Value |
|---|---|
| `live_custom_onboarding_enabled` | **0** |
| `live_custom_onboarding_allowlist` | **0 rows** |
| `stripe_connect_transfers_enabled` | **0** |
| `payout_execution_enabled` | **0** |

Transfers, payout execution, and automatic payouts were **never** enabled.

---

## Required human Stripe Dashboard action (LIVE)

On the **LIVE** Traverion account (`acct_1TFXp1CJawbWge6X`):

1. Open [Platform profile](https://dashboard.stripe.com/settings/connect/platform-profile) (**Live mode**, not Test).
2. **Acknowledge** every responsibility item — especially **collecting requirements for connected accounts**.
3. Confirm negative-balance / loss liability is assigned to the **platform** (not Stripe). If the UI still says Stripe is responsible for losses, ask Stripe support to switch the platform profile so the platform can collect requirements for `dashboard: none` recipients.
4. Also confirm [Platform setup](https://dashboard.stripe.com/settings/connect/platform-setup) shows approval to create live connected accounts.

After that, re-authorize the same temporary create window; Traverion-side eligibility remains GO.

---

## Safety

No fabricated Connect account. No transfers/payouts. Create window closed on failure.
