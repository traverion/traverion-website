# P9.6 — Accounts v2 TEST implementation and certification

**Date:** 2026-11-16
**Stripe mode:** TEST only
**LIVE accounts created:** none
**Gate left:** `live_custom_onboarding_enabled = 0`, allowlist empty

## Recommendation

**GO** to deploy this code to production while the LIVE creation gate stays off. Production runs in live mode, so the new branch does not execute there. The LIVE supplier create path is still Accounts v1 Custom, still behind the gate, and still has no Express fallback.

**NO-GO** for a LIVE Accounts v2 pilot, for enabling the gate, and for payout activation.

## TEST account

One disposable account was created with idempotency key `traverion-p96-v2-cert-fi-1`.

| Field | Retrieved value |
| --- | --- |
| Account | `acct_1UcWUMC3Batf5jGY` |
| livemode | false |
| Country / entity | FI / company |
| Dashboard | `none` |
| Requirements collector | `application` |
| Losses collector | `application` |
| Fees collector | `application` |
| Configurations | `recipient` only |
| Merchant | absent |
| `card_payments` | absent |
| `stripe_transfers` after onboarding | `active` |

Stripe API version: `2026-10-28.preview`. A mismatched configuration would have stopped the run. Nothing fell back to Express or v1 Custom.

## Wizard lifecycle on that account

The same account, not a second one, accepted the six data steps:

| Step | API | Result |
| --- | --- | --- |
| Business | v2 identity `business_details`, Finnish `fi_yt`, business URL | 200 |
| Representative | v1 Person on the v2 account, as Stripe’s marketplace guide specifies | 200 |
| Identity / agreement | v2 `identity.attestations.terms_of_service` | 200 |
| Bank | Stripe.js-style `btok_` attached with the v1 external-account API | 200 |
| Preferences | Traverion payout cadence, not a Stripe payout enablement | unchanged |
| Review | `stripe_transfers` active, past-due requirements empty | not labeled Verified |

TEST mode did not ask for an identity document after the keyed data. The embedded document step is still wired for `documents`, `verification.document`, and proof-of-liveness keys, and it was not exercised. Do not treat this as certification of document capture. LIVE can still require a document.

The partner UI does not show Verified for this account. Verified requires a live account and an active transfer capability. A TEST account stays unlabeled even when `stripe_transfers` is active.

## Requirement recovery

| Stripe key | Wizard step |
| --- | --- |
| `identity.business_details.*`, `fi_yt`, `business_url` | Business |
| `representative.*`, `directors.*`, `executives.*`, `owners.*`, `persons_provided` | Representative |
| `terms_of_service`, document and liveness keys | Identity |
| `external_account` | Bank |
| Payout cadence | Preferences |
| Capability still inactive, or anything left over | Review |

Outstanding past-due keys resume the earliest of those steps. Restricted and rejected accounts stay on the review state until Stripe clears them.

## Security

| Check | Result |
| --- | --- |
| New TEST create | Accounts v2 only. A failed or mismatched create releases the claim and does not call v1 `accounts.create`. |
| LIVE create | Unchanged v1 Custom path, still gated. |
| Finland | A non-FI country is refused before the TEST create. |
| Idempotency | `traverion-v2:{supplierId}:test` |
| Ownership | Metadata `traverion_supplier_id` and `traverion_account_api=v2` |
| Bank and documents | Token and file ids only. Raw account numbers and document bytes are not stored. |
| Duplicate supplier mapping | Existing account id is reused. |
| Webhook | `account.updated` still mirrors the account. A v2 account’s v1 `type` is `none`; the mirror stores that as `custom` so the native wizard and the database check both accept it. `card_payments` is not marked on from `charges_enabled`. |
| Transfers | Inactive `transfers` cannot satisfy Verified. |

## Production protection

Read after the TEST work, with no production deploy:

| Check | Value |
| --- | --- |
| `live_custom_onboarding_enabled` | 0 |
| Allowlist | 0 |
| Royal Nordic | Express, livemode true, `acct_1UcAxbCOlSVGqrHJ` |
| Payout flags | all 0 |
| READY periods | 0 |
| Transfer attempts | 0 |

The production Edge function was not redeployed. LIVE onboarding behavior is the previously deployed function until a later deploy of this commit.

## Limitations

- Stripe activated `stripe_transfers` in TEST without a document. Document and liveness capture remain unimplemented as a completed browser step.
- Desktop and mobile browser passes were not run. The production app calls the production function, which is still the previous LIVE build, and a second supplier create was not allowed.
- v1 `accounts.retrieve` reports `charges_enabled: true` on this recipient account even though `card_payments` was not requested. Traverion stores charges as enabled only when `card_payments` is active.
- Accounts v2 requirements use names such as `identity.attestations.terms_of_service`, not the v1 `tos_acceptance` keys. The wizard maps both.
- A non-Finnish supplier is out of scope.

## Stop

No LIVE account was created. No payout, transfer, or READY period was created. The gate and allowlist were left untouched.
