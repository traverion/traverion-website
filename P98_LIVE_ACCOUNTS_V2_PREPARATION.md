# P9.8 — LIVE Accounts v2 pilot preparation

**Date:** 2026-11-16  
**Edge function:** `connect-supplier-onboarding` version 27  
**Hosted frontend:** unchanged, `index-BhkMQRMd.js` on `partner.traverion.com`  
**Verdict:** **NO-GO** for the first LIVE Accounts v2 account creation.

The LIVE creation path is deployed and blocked. No LIVE account was created, no supplier was migrated, and no payout flag was turned on.

## 1. Implementation and deployment

New Finnish suppliers, in both TEST and LIVE, now use one Accounts v2 recipient create:

- Dashboard `none`
- Fees, losses, and the platform-collected requirements that Stripe assigns for that dashboard
- `stripe_transfers` requested
- No merchant configuration and no `card_payments`
- Finland only
- Idempotency key `traverion-v2:{supplierId}:{mode}`

LIVE creation checks `live_custom_onboarding_enabled` and `live_custom_onboarding_allowlist` before the claim, and checks them again immediately before `POST /v2/core/accounts`. A rejected v2 response releases the claim and does not create an Express or legacy Custom account. The admin path uses that same v2 call and the same gate. `stripe.accounts.create` is no longer present.

Production function version moved from 26 to 27. An unauthenticated request returns 401, `Missing Authorization header`. The temporary read probe was deleted and now returns 404.

The hosted partner bundle is still the P9.7.1 bundle. It calls the production project `xcopqllkulxfkpunetbc` and does not reference staging. The six-step wizard was not changed.

## 2. LIVE compatibility

Read-only calls used Stripe version `2026-10-28.preview` and the production LIVE key. No create request was sent.

| Call | Result |
| --- | --- |
| `GET /v2/core/accounts?limit=10` | HTTP 200, mode `live`, 2 accounts |
| Retrieve with `defaults`, recipient, merchant, and identity | HTTP 200 |
| Both accounts | `livemode` true, dashboard `express`, configuration `recipient`, country `FI` |
| Retrieved responsibilities | fees `application_express`, losses `application`, requirements `stripe` |
| Merchant | absent |

The LIVE platform accepts this Accounts v2 version for list and retrieve. The two existing accounts are Express accounts with Stripe-collected requirements. Dashboard `none` with application-collected requirements was not observed, because that configuration is produced by a create that this mission did not run. TEST success is not evidence that a LIVE create will be accepted.

## 3. Creation safeguards

Unit and source-order tests in `src/lib/accounts-v2-config.test.ts`, plus the P9.1, P9.3, and native-onboarding certification tests: 24 passed.

| Check | Result |
| --- | --- |
| Gate off | Blocks in `liveCustomCreateAllowed` before any Stripe call |
| Empty allowlist | Blocks when the flag is on and the supplier is not approved |
| Unauthorized supplier | Rejected by the allowlist check |
| Existing Express account | Returned before the gate, the claim, and the create |
| Duplicate create | Claim returns `reuse` or `in_progress` before the create |
| Incorrect country | `finlandSupplierCountry` runs before `POST /v2/core/accounts` and rejects non-Finland |
| API failure | The create function contains no `stripe.accounts.create` after the v2 request |
| Cross-supplier access | Ownership metadata mismatch throws before the account is treated as the supplier's |

## 4. Account lifecycle

| Behavior | Result |
| --- | --- |
| Retrieve and refresh | Existing sync path, with the v2 transfer status read when the account is tagged `traverion_account_api=v2` |
| Business, representative, agreement | v2 updates for a tagged v2 account in TEST or LIVE |
| Bank | Unchanged Stripe.js bank token attached as an external account |
| Additional identity | Unchanged embedded verification step when Stripe asks for a document. Not executed |
| Express | LIVE Express is returned and is not archived or replaced |
| TEST and LIVE mixing | A TEST account is rejected on LIVE. A LIVE account is rejected on TEST |
| Verified | Requires a live account, active `stripe_transfers`, payouts enabled, and no outstanding requirements |
| TEST account marking a LIVE supplier Verified | Rejected. `connect_account_livemode === false` cannot be Verified |

## 5. Production gate and allowlist

| Control | Value |
| --- | --- |
| `live_custom_onboarding_enabled` | 0 |
| Allowlist rows | 0 |
| Migration 311 | applied |

## 6. Existing Express regression

Royal Nordic stayed on `acct_1UcAxbCOlSVGqrHJ`, type `express`, livemode true, status `restricted`, monthly cycle, threshold 0. It is the only linked production supplier. Two profiles remain unlinked. Their create endpoint was not called.

Stripe still lists two LIVE connected accounts, both Express. No new account id appeared.

## 7. Money movement and remaining blockers

| Check | Result |
| --- | --- |
| Earning items | 11 (eligible 5, pending 2, reversed 4) |
| Earning amount | 85232 minor units |
| Royal Nordic earnings | 10 items, 85232 minor units |
| Payout flags | all 0 |
| Payout periods | 0 |
| READY periods | 0 |
| Transfer attempts | 0 |
| Bank payout attempts | 0 |

Remaining blockers before any LIVE create:

- `POST /v2/core/accounts` with dashboard `none` has not been executed on LIVE.
- The service agreement Stripe assigns to that recipient is still unread.
- An individual supplier has not been certified. The implemented default remains a company unless the profile says individual.
- Document and liveness capture have not been completed.
- `stripe-webhook` is still version 112. Refresh through onboarding reads the v2 transfer status. An asynchronous `account.updated` for a future dashboard-none account is not covered by the deployed webhook.
- The gate stays off and the allowlist stays empty. The two unlinked production suppliers are not approved for a create.

## 8. Decision

**NO-GO** for a first LIVE Accounts v2 account.

The code can create one only after a separate authorization turns the existing gate on for one approved Finnish supplier. That authorization is not granted here.
