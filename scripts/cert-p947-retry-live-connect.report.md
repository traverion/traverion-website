# P9.47 — Retry first LIVE Connect activation

| | |
|---|---|
| **Date** | 2026-11-18 / 2026-11-19 |
| **Supplier** | EM Global Oy `eced0f8c-c2e4-469b-8bba-15170be68cc1` |
| **Authorization** | Founder confirmed LIVE Platform Profile acknowledged; temporary EM-only create gate |
| **Verdict** | **PASS — first genuine LIVE Accounts v2 Connect account created** |

---

## Real Stripe result

| Field | Value |
|---|---|
| Connected account | **`acct_1UdHT6C7oDQnLYSF`** |
| API | Accounts v2 (`traverion_account_api=v2`) |
| Type / dashboard | Custom / `none` |
| Livemode | **true** |
| Configurations | `recipient` (`stripe_transfers` requested) |
| Responsibilities | `fees/losses/requirements_collector = application` |
| Metadata supplier | `eced0f8c-c2e4-469b-8bba-15170be68cc1` |
| Onboarding status | `restricted` (requirements past due — expected until hosted KYC completes) |
| Transfers capability | inactive / restricted until requirements provided |
| Charges / payouts enabled | **false** (correct) |
| Account Link | **Works** (Stripe-hosted, Traverion branded) |

Platform profile acknowledgment unblocked Accounts v2 create. Prior P9.45 platform-profile error is resolved.

Creation audited:

- `p947_live_create_window_opened` @ 22:36:40Z  
- Stripe account created @ 22:36:47Z  
- `p947_live_connect_account_ensured` + window closed @ 22:36:58–59Z  

Certification script then idempotently reused the same account (no second create).

---

## Window lifecycle

| Step | Result |
|---|---|
| Revalidate verified + pilot + FI + money gates off | **PASS** |
| Confirm no prior EM Global Connect (before create) | **PASS** (null → then one account) |
| Open EM-only allowlist + `live_custom_onboarding_enabled=1` | **Done** |
| `ensure_account` | **PASS** → `acct_1UdHT6C7oDQnLYSF` |
| Idempotent second `ensure_account` | **PASS** (same id) |
| Account Link + status sync | **PASS** |
| Close gate + clear allowlist | **Done** |
| Transfers / payouts / auto-prepare | **Remain 0** |

---

## Final gate state

| Control | Value |
|---|---|
| `live_custom_onboarding_enabled` | **0** |
| `live_custom_onboarding_allowlist` | **0 rows** |
| `stripe_connect_transfers_enabled` | **0** |
| `payout_execution_enabled` | **0** |
| `payout_auto_prepare_enabled` | **0** |
| `payout_pilot_prepare_enabled` | **0** |

No payouts, transfers, or financial transactions were initiated.

---

## Browser certification

Authenticated production session on `partner.traverion.com/partner/onboarding?phase=status`:

| Check | Result |
|---|---|
| Status shows Verification pending | **PASS** |
| Payout verification = Action required | **PASS** (synced from Stripe) |
| CTA Continue verification | **PASS** |
| Opens Stripe-hosted onboarding (Traverion branded) | **PASS** |
| Return to Traverion → partner portal | **PASS** after edge fix |

### Fix shipped this mission

Pre-fix Account Link return used `PUBLIC_SITE_URL` (`www.traverion.com`) when partner origin was not allowlisted → 404. Edge now always allowlists / prefers `https://partner.traverion.com` for Connect returns. Redeployed `connect-supplier-onboarding`.

---

## Remaining launch blockers (not money movement)

1. **Complete Stripe-hosted KYC** for EM Global (representative, company, bank, TOS) via Continue verification.  
2. Sync until `connect_onboarding_status` is no longer `restricted` and transfers capability can activate.  
3. Controlled LIVE customer payment certification (still 0 paid bookings).  
4. Transfers / payout execution remain **OFF** until separately authorized.  
5. Note: Connect `display_name` currently mirrors supplier business name “Royal Nordic” (auth email `contact@royalnordic.fi`); Traverion company verification remains EM Global Oy — cosmetic metadata to clean up later.

---

## Safety

Exactly one EM Global LIVE Connect account. No duplicate creates. Gate closed. Money movement disabled.
