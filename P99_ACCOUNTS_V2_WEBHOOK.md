# P9.9 — Accounts v2 lifecycle and webhook certification

**Date:** 2026-11-16  
**Webhook:** `stripe-webhook` version 116  
**Verdict:** **NO-GO** for a first LIVE Accounts v2 account.

The webhook can now follow Accounts v2 verification changes. No LIVE account was created and no payout flag was turned on.

## 1. Implementation

`stripe-webhook` still verifies signatures with `constructEventAsync` and deduplicates through `stripe_webhook_events`.

Legacy `account.updated` remains the Express snapshot path. Accounts v2 notifications are thin events. They identify the account and do not include its state. The handler retrieves the account, then stores requirement keys, transfer capability, and onboarding status. It does not store identity documents or bank details, and it does not mark a supplier Verified because an event arrived.

A TEST event cannot update a LIVE supplier, and a LIVE event cannot update a TEST supplier. An unknown or unlinked account is ignored. Express accounts without v2 metadata keep the existing mirror path. When Stripe omits `livemode`, a stored livemode is kept.

The review step shows the provider status label: Under review, Action required, or Verified only when the live account is actually complete.

## 2. Deployment

Production `stripe-webhook` is version 116 and active. An invalid signature returns 400. The temporary setup function was removed and returns 404.

The LIVE thin-event destination is `ed_61VlvLJcmYiW1mc1w16UOvmNK3DGH74TFmUOX16ngLoW`, enabled, livemode true, payload `thin`, scope `@self`. Its signing secret is stored for the service role only.

## 3. Event subscription matrix

| Destination | Mode | Payload | Scope | Events |
| --- | --- | --- | --- | --- |
| Existing | LIVE | snapshot | `@self` | checkout, payment, charge, transfer, dispute |
| Existing | LIVE | snapshot | `@accounts` | `account.updated`, payout created, paid, failed, canceled, updated |
| New | LIVE | thin | `@self` | `v2.core.account.created`, `updated`, `closed`; recipient configuration and capability; defaults; identity; requirements; future requirements |

`account.updated` does not carry Accounts v2 state. Stripe’s event catalog lists the thin types above. The payload is an unversioned notification with `related_object.id`. The account is read afterward.

## 4. TEST certification

Account `acct_1UcWUMC3Batf5jGY` stayed livemode false, dashboard none, country FI, and `stripe_transfers` active.

| Check | Evidence |
| --- | --- |
| Real delivery | Stripe sent `v2.core.account.updated` to staging after a metadata-only update. The row reached `processed`. |
| Signature | The real event verified. A bad signature on production returned 400. A synthetic thin event also verified in unit tests. |
| Duplicate | Synthetic replay of the same event id returned `duplicate` after the first processing. |
| Out of order | The handler uses the retrieved account, not an older payload. Covered by unit test. |
| Requirements | Due, past due, and pending verification map into the wizard. Pending stays Under review and is not Verified. |
| Restricted to active | Not reproduced on Stripe. The TEST account was already active. The status function covers the transition with a fixture. |
| Unknown account | Synthetic signed event for an account that does not exist returned `unknown_connect_account` and did not create a supplier. |
| TEST / LIVE | A synthetic livemode-true event on staging was ignored as `livemode_mismatch`. A TEST event is also refused for a supplier stored as live. |
| Express | Not sent to Royal Nordic. The Express snapshot branch remains in the handler. |

The metadata update and the real `v2.core.account.updated` are Stripe events. The unknown-account, duplicate, and livemode-mismatch calls were signed fixtures.

## 5. Express regression

Royal Nordic is still `acct_1UcAxbCOlSVGqrHJ`, Express, livemode true, restricted, monthly, threshold 0. It is the only linked production supplier. No verification fields were submitted.

## 6. Service agreement

Stripe assigns the Accounts v2 agreement automatically. The v1 `tos_acceptance.service_agreement` field is not used, and the TEST retrieve does not return an agreement enum.

What is observable on the TEST account: dashboard none, recipient only, no merchant, no `card_payments`, fees, losses, and requirements collected by the application, country FI, company, transfer capability active. That is the documented recipient shape. The literal `recipient` or `full` value was not returned.

LIVE has no Accounts v2 recipient, so the LIVE agreement is unverified. The pilot stays limited to Finnish suppliers.

For this shape, Traverion collects requirements and must present the recipient Connected Account Agreement, then record acceptance with the account attestation. If ownership or the tax id changes, acceptance has to be collected again. An acquirer disclosure is not required for a recipient-only account. Recipient transfers can take an extra 24 hours to become available.

## 7. Remaining limitations

- The agreement enum is unread on TEST and unverified on LIVE.
- An individual supplier and document or liveness capture are still uncertified.
- A real restricted-to-active change was not produced. The TEST account was already active.
- No LIVE v2 account exists, so no LIVE thin event has been delivered yet. The destination is subscribed.
- Future requirements on the TEST account are `eventually_due` and are not shown as current work.

## 8. Decision

**NO-GO** for a separately approved first LIVE Accounts v2 account.

The webhook can track that account after it exists. Creating it is still a separate authorization. The creation gate is 0, the allowlist is empty, earnings are 11 items and 85232 minor units, Royal Nordic earnings are 10 items and 85232 minor units, every payout flag is off, and there are no periods, READY rows, transfers, or bank payouts.
