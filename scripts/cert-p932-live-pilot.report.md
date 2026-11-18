# P9.32 — LIVE Payout Onboarding Pilot

| | |
|---|---|
| Verdict | **PARTIAL** |
| Commit | *(pending)* |
| Vercel | *(pending)* |
| Edge | `connect-supplier-onboarding` redeployed |
| Migration | `20261117235450_p932_payout_wizard_server_draft.sql` applied |
| Cert | `scripts/cert-p932-live-pilot.report.json` |
| Screenshots | `scripts/p932-screenshots/` |

## Executive summary

Pilot **plumbing is ready**; LIVE Connect **creation was not enabled**. Transfers and payout execution remain **OFF**. No Connect accounts were created. Statuses stay honest (no simulated Verified / bank connected).

---

## 1. Audit (production)

| Item | Result |
|---|---|
| Platform Stripe mode | LIVE credentials configured (`STRIPE_LIVE_PAYMENTS_ENABLED` present; edge resolves LIVE secret) |
| Publishable / webhook secrets | Present (`STRIPE_WEBHOOK_SECRET`, `_LIVE`, `_TEST`, Connect LIVE/TEST) |
| `live_custom_onboarding_enabled` | **0** |
| Allowlist | **0** rows |
| `payout_execution_enabled` | **0** |
| `stripe_connect_transfers_enabled` | **0** |
| Connected accounts | **0** |
| Webhook mirror | `account.updated` + Accounts v2 → `mirrorConnectAccount` (unchanged) |

Frontend local `.env` still has TEST publishable keys for local Vite; production edge uses LIVE secrets.

---

## 2. What shipped (without enabling LIVE create)

1. **Status eligibility** — `live_gate_enabled`, `supplier_allowlisted`, `live_create_allowed`, `live_create_blocked_reason` on status/refresh/save.
2. **Client provision gate** — `canProvisionConnectAccount` allows LIVE create only when `live_create_allowed === true` (or TEST / existing account).
3. **Server draft** — `supplier_profiles.payout_wizard_draft` (+ updated_at); edge `save_wizard_draft` strips IBAN / tokens / full DOB (year only).
4. **Device cache v5** — no IBAN; full DOB cleared from localStorage (re-enter before Stripe submit).
5. **Done** — persists server draft, refreshes Stripe mirror when provisioned, never invents Verified.
6. **Hydration** — wizard merges server draft on status load (cross-device non-sensitive resume).

---

## 3. Why still PARTIAL (exact blockers)

| Blocker | Status |
|---|---|
| No explicitly approved named supplier for this mission | **Blocking** |
| `live_custom_onboarding_enabled=0` | **Blocking** (intentional) |
| Allowlist empty | **Blocking** (intentional) |
| Zero Connect accounts → verification cannot leave not_started | Expected until create |
| Transfers / payout execution | Kept **OFF** by safety |

Wizard → real Stripe account creation / identity / bank attach works **only after** the approval checkpoint below.

---

## 4. APPROVAL_CHECKPOINT — enable LIVE Connect creation

Do **not** run until a founder explicitly names one supplier id.

1. Confirm that profile: Finland, real legal name + business type, owner login, **no** `stripe_connected_account_id`, no open create claim.
2. Insert **one** row into `live_custom_onboarding_allowlist` (service role).
3. Separately authorize `live_custom_onboarding_enabled = 1` for a controlled window.
4. Supplier signs in → continues Business once → `ensure_account` creates LIVE Accounts v2.
5. Prefer closing the gate (flag → 0, delete allowlist row) after create.
6. Leave `payout_execution_enabled` and `stripe_connect_transfers_enabled` at **0**.

Pilot approvals table (`live_accounts_v2_pilot_approvals`) is **eligibility only** — it does not unlock create.

---

## 5. Cert evidence

Authorized disposable partner session; production DB readbacks; **no money moved**; **no LIVE create**.

Desktop 1280 + mobile 390 completion screenshots captured. Honesty + safety checks pass; LIVE create remains gated → **PARTIAL**.
