# P9.11 — First LIVE Accounts v2 pilot readiness

**Date:** 2026-11-17  
**Production function:** `connect-supplier-onboarding` version 29  
**Webhook:** `stripe-webhook` version 116  
**Verdict:** **NO-GO.** No LIVE account was created. The gate stayed 0 and the allowlist stayed empty.

Explicit authorization of one named supplier is required before the gate is turned on, before an allowlist row is inserted, and before any LIVE account is created.

## 1. Pilot supplier

No supplier is approved for this pilot.

| Supplier | Eligibility |
| --- | --- |
| Royal Nordic `9e42bd3a-e72c-4472-bb7e-e8c3a59e2c18` | Ineligible. Finland company, owner login matches the profile, legal name EM Global Oy. A LIVE Express account is already linked: `acct_1UcAxbCOlSVGqrHJ`, livemode true, status restricted. A legacy connected-account id is also stored. The creation path returns that Express account before the gate and does not replace it. |
| EM Global Oy `22217025-f1bc-4e80-93d3-6b9b918a4629` | Not selected. No connected account, no creation claim, and the owner login matches the profile. Country, business type, and legal name are blank. The display name matches Royal Nordic’s legal name. There is no allowlist approval and no record that this supplier will provide genuine details or complete real Stripe verification. |
| Unnamed profile `c2dd731a-3001-4bc2-b8ea-7f7dc1ceae09` | Not selected. No connected account, no claim, no country, no business type, and no legal name. The owner login matches the profile. There is no approval. |

Production has 3 supplier profiles and 2 team-member rows whose supplier ids have no profile. Those rows cannot be onboarded. No unlinked profile has an open creation claim. The allowlist has 0 rows, which is the approval record for LIVE creation.

A blank country is treated as Finland by the creation check. That is why a blank unlinked profile must not be allowlisted until a person records the country, the legal entity, and the supplier’s agreement to real verification.

## 2. LIVE configuration preflight

Production version 29 is the intended path. `createAccountsV2Supplier` is the only account-creation call. It POSTs `/v2/core/accounts` with `Stripe-Version: 2026-10-28.preview`. There is no `stripe.accounts.create` fallback.

The create body requests:

- `dashboard: none`
- `fees_collector: application` and `losses_collector: application`
- `stripe_transfers.requested: true` on the recipient configuration
- identity country `fi`
- metadata `traverion_account_api: v2` and `traverion_supplier_id`
- no merchant configuration and no card payments

`requirements_collector` is not sent. Stripe assigns `application` for this dashboard and losses shape. The function reads the created account and rejects the result unless dashboard is none, all three collectors are application, recipient is present, merchant and card payments are absent, and the country is Finland. A rejected result throws “No legacy account was created.” TEST account `acct_1UcWUMC3Batf5jGY` matched that shape. A LIVE create has never been sent, so the LIVE response is still unproven.

The idempotency key is `traverion-v2:{supplierId}:live`. The gate is checked again immediately before the POST. On LIVE, Express is returned before that gate. A second LIVE account is refused when a legacy LIVE id cannot be restored.

## 3. Single-supplier authorization

Do not run this until a named supplier id is explicitly authorized.

1. Confirm that profile has country Finland, a real legal name and business type, an owner login, no `stripe_connected_account_id`, no legacy LIVE id, and no `connect_create_claimed_at`.
2. Insert one allowlist row for that id only. `live_custom_onboarding_allowlist` is service-role only.
3. Set `commercial_runtime_config.live_custom_onboarding_enabled` from 0 to 1.
4. Have that supplier sign in at `partner.traverion.com` and continue once from Business information. That calls `ensure_account`. Do not call `admin_ensure_live_connect`. That admin action can clear a non-live link and can open an Account Link for an existing LIVE account.
5. Read the profile. The new `stripe_connected_account_id` must be stored and `connect_account_livemode` must be true.
6. Close the gate in the same session, before any other supplier can continue:
   - set `live_custom_onboarding_enabled` back to 0
   - delete the allowlist row
7. Leave `payout_execution_enabled`, `stripe_connect_transfers_enabled`, `payout_auto_prepare_enabled`, and `payout_pilot_prepare_enabled` at 0.

With the flag at 0, LIVE creation fails closed even if an allowlist row remains. Deleting the row means a later accidental flag change still cannot create an account. An existing account is reused by the claim function, so closing the gate does not remove the pilot account.

Payouts stay disabled on their own. `execute-supplier-transfers` refuses a LIVE platform secret before the database flag is consulted, and that flag is 0.

## 4. Creation failure and containment

- A refused claim, a missing flag, or an empty allowlist returns before Stripe.
- A claim younger than two minutes returns “already in progress” and does not create a second account.
- If Stripe or the configuration check throws, the claim is cleared only while `stripe_connected_account_id` is still null.
- The same idempotency key returns the original Stripe account on a retry. Do not change the create body under that key, and do not invent a second key.
- If Stripe created an account and the profile has no id, stop. Retrieve that account read-only, match `traverion_supplier_id`, and link or close it under a separate authorization. Do not continue verification and do not enable payouts.
- If dashboard, collectors, merchant, card payments, or country differ from the approved shape, stop. Do not repair the account by creating an Express or legacy Custom account.

## 5. Checks after a later authorized create

Run these before any supplier continues past account creation. Stop on the first mismatch.

1. `GET /v2/core/accounts/{id}` with `Stripe-Version: 2026-10-28.preview` and includes `configuration.recipient`, `configuration.merchant`, `defaults`, `identity`, and `requirements`.
2. `dashboard` is `none` and `livemode` is true.
3. `requirements_collector` is `application`.
4. `fees_collector` and `losses_collector` are `application`.
5. `applied_configurations` contains `recipient` and does not contain `merchant`.
6. `stripe_transfers` was requested. Record its status. Active is not required for the pilot to exist, and it does not authorize a transfer.
7. Record `identity.attestations` and any v1 `tos_acceptance.service_agreement` exactly as Stripe returns them. Do not treat a missing agreement value as either the full agreement or the recipient agreement. Record outstanding requirement descriptions. The TEST account did not return an agreement enum.
8. Metadata `traverion_supplier_id` equals the approved profile, and that profile stores this account id with livemode true and type `custom` (Stripe type `none` is stored as custom).
9. A thin `v2.core.account` event for this id is accepted by the production webhook. Destination `ed_61VlvLJcmYiW1mc1w16UOvmNK3DGH74TFmUOX16ngLoW` is the existing LIVE `@self` destination. Webhook processing must not set Verified by itself.
10. `supplier_transfer_attempts` stays 0, payout periods stay 0, and no payout flag changes.

Verified in the product requires livemode true, `stripe_transfers` active, payouts enabled, status complete, and no current or past-due requirements. Under review is status pending. Action required is status restricted. A TEST account is never labeled Verified.

## 6. Wizard and compliance readiness

The hosted wizard already presents the Stripe recipient notice at `https://stripe.com/legal/connect-account/recipient` and the Stripe privacy policy. Consent starts unchecked, is not restored from a saved draft, and the server accepts only version `stripe-recipient-notice-2026-11-16` with the request IP and user agent. The consent audit is written before Stripe, and a Stripe failure is recorded separately. Express accounts still collect their agreement in Stripe’s own step.

The six-step wizard saves and resumes. Bank details are tokenized in the browser. Identity documents stay with Stripe when a document requirement is due. The pilot must use the supplier’s real business, representative, and bank details. Document or liveness checks are not bypassed.

## 7. Production safety

| Check | Result |
| --- | --- |
| LIVE creation gate | 0 |
| Allowlist | 0 |
| Royal Nordic | Express `acct_1UcAxbCOlSVGqrHJ`, livemode true, restricted |
| Connected accounts | 1 |
| Payout flags | all 0 |
| Earnings | 11 items, 85232 minor units |
| READY periods | 0 |
| Transfers | 0 |
| Open creation claims | 0 |

## 8. Recommendation

**NO-GO** for creating the first LIVE Accounts v2 account.

The creation path, the disabled gate, the recipient agreement, and the webhook destination are in place. The missing piece is an approved pilot supplier. Royal Nordic cannot be the pilot. The two unlinked profiles were not selected. Authorize one supplier by id, with Finland and genuine business details confirmed, before any gate change or account creation.
