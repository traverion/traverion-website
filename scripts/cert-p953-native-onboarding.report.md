# P9.53 — Native verification and onboarding UX

**Verdict: PASS.** TEST Accounts v2 certification passed on disposable account `acct_1UdWWoC3BagnTlZ5` (livemode false). Production UI passed **62/62** after the visual pass, on `cb33f420`. EM Global stayed on `acct_1UdHT6C7oDQnLYSF`. No live identity or bank submission. Money gates stayed at 0.

Final production screenshots (1440, 768, 390 × company, documents, identity, bank, verification) are local only in `scripts/p953-screenshots/`. They are not in git.

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

Status stays **Verification pending** and lists the real due items. Identity and payout readiness are separate lanes. **Ready to receive payouts** also requires `payout_execution_enabled` and `stripe_connect_transfers_enabled`. Both are 0, so a finished form cannot show payouts as ready.

Desktop, tablet, and mobile. Company details stayed visible. The documents step shows only the file already on record. Refresh resumed the same step. Edge calls were status reads. The same live account remained restricted. Autosaved wizard JSON was restored.

## UX changes

The earlier production screens showed uncarded text on a white field, the documents step repeating the whole company record on tablet, and the verification action sitting in the page body.

What shipped:

- One column, about 40rem, with the same card, radius, hairline, and shadow on the company summary, documents file, identity form, bank form, requirement list, and status lanes.
- Canvas set to `#eef1f6` so those cards sit on a surface. The sticky footer stays white, with one primary action: Continue, or Continue verification on the status step.
- Step motion stays at 200ms.
- Verified companies follow the selected phase. Company shows the approved summary. Documents shows the registration file. The company step no longer repeats that file.
- Labels stay short. Extra explanation stays behind the blue help icon.
- 390px keeps the phase chips in a horizontal scroller. The identity form continues in the step pane above the footer.

## Remaining visual note

Short steps (documents, bank) still leave open canvas under the card because the footer stays pinned to the viewport. That space is the workspace, not a second scroll. On a 390px screen the director row begins at the bottom of the first identity view and continues in the step pane.

## Remaining live blockers

Do not submit EM Global’s identity or bank details until that submission is explicitly approved. The open live requirements are still company director, company tax ID, director name, director date of birth, bank account, and terms. Liveness and Stripe risk reviews, if they appear later, cannot be completed by a Traverion form. Payouts stay off while the money gates are 0, even if Stripe later marks transfers active.
