# P9.53 — Native onboarding finalization

TEST API: **PASS** on disposable account `acct_1UdWWoC3BagnTlZ5` (livemode false). Production UI: **PASS 62/62**. EM Global stayed on `acct_1UdHT6C7oDQnLYSF`. No live identity or bank submission. Money gates stayed at 0.

## TEST Accounts v2

| Step | Result |
| --- | --- |
| Create recipient account, dashboard none, Finland company | Accepted, test mode |
| Company name, address, phone, `fi_yt` business ID | Accepted |
| `POST /v2/core/accounts/{id}/persons` representative, director, owner | Accepted (`v2.core.account_person`) |
| Person update | Accepted |
| Second person as beneficial owner | Accepted |
| `identity.attestations.persons_provided` | Accepted |
| Terms of service attestation | Accepted |
| Bank token, then v1 external account attach | Accepted, last4 only |
| Identity file via `files.stripe.com`, then `documents.primary_verification.type = front_back` | Accepted |
| Requirements retrieve | `stripe_transfers` became `active` in test; no items currently due |

The incompatibility fixed before any live submission: v2 accounts now create and update people with `/v2/core/persons` paths, not the v1 Persons API. Identity files attach with `documents.primary_verification`, not `person.verification.document`. Ownership is sent as a string percent, and only when it is above 0.

This test account did not require an identity document before transfers showed active. The upload was still proven. Test-mode success is not live verification.

## Production UI

Custom accounts no longer get a generic “open Stripe’s questionnaire” button. The identity screen is the Traverion date picker, director checkbox, and owners. A Stripe embedded step can appear only when a requirement is liveness, selfie, or a risk review. EM Global has none of those, and the production pass found no Stripe onboarding frame.

Status stays **Verification pending** and lists the real due items. **Ready to receive payouts** now also requires `payout_execution_enabled` and `stripe_connect_transfers_enabled`. Both are 0.

Desktop, tablet, and mobile. Company details stayed visible. Refresh resumed the same step. Edge calls were status reads. The same live account remained restricted. Autosaved wizard JSON was restored.

## Remaining live blockers

Do not submit EM Global’s identity or bank details until that submission is explicitly approved. The open live requirements are still company director, company tax ID, director name, director date of birth, bank account, and terms. Liveness and Stripe risk reviews, if they appear later, cannot be completed by a Traverion form. Payouts stay off while the money gates are 0, even if Stripe later marks transfers active.
