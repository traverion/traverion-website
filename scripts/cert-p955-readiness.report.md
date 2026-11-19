# P9.55 — LIVE verification readiness

**Verdict: PASS 73/73.** Certified at 2026-11-19T15:57:35Z on production `partner.traverion.com` for EM Global, viewports 1440, 768, and 390. UI commits `b6b15ecb` and `d64a9373`. Edge functions `connect-supplier-onboarding`, `notify-supplier-event`, and `stripe-webhook` are deployed.

No identity or bank details were submitted. No Connect account was created. No payout gate was changed. No funds moved.

## What is ready

The supplier path is one Traverion flow: Company, Documents, Identity, Bank, Status. The company step is a confirmation card of the verified record. Documents shows the registration file. Identity and Bank are Traverion forms. The status page reads Verification pending.

Identity asks for an explicit **Send for verification** confirmation before Traverion sends the verified company record and this person’s name and date of birth. Bank asks for **Accept the terms** before the IBAN is tokenized. A missing confirmation stops the step with a Traverion message.

Before that send, the client and the onboarding function check the Finnish business ID (modulus 11). The client checks the date of birth (18 or older), ownership percent (0–100), and the IBAN (Finnish shape `FI` plus 16 digits, plus the checksum). The full date of birth is not written to the Traverion draft. The IBAN is tokenized in the browser and only the token is sent. Stripe errors that contain account ids, request ids, or long numbers are replaced with a short Traverion sentence. Tax ID, date of birth, IBAN, ownership, and terms errors map to those sentences.

After submission the status page stays on Verification pending and re-reads the supplier profile every 20 seconds. It does not poll Stripe on that interval. Webhook updates to the profile show up on that refresh.

Notices, service-role only, and only after `details_submitted` is true on the live account:

| When | Subject |
| --- | --- |
| Stripe still has due items | More information is needed for verification |
| Stripe has no outstanding requirements, and payouts are still off | Verification complete |
| Stripe can pay and both Traverion payout gates are on | Verification complete — payouts are ready |

The current account has `details_submitted` false, so the next account webhook will not send the first two notices. Both payout gates are 0, so the payout notice cannot send.

## Certification

- Same account: `acct_1UdHT6C7oDQnLYSF`, custom, live, restricted.
- Gates: `live_custom_onboarding_enabled`, `payout_execution_enabled`, and `stripe_connect_transfers_enabled` are 0.
- No Stripe onboarding iframe. Recorded actions on the status read were status syncs only.
- Saved representative name is present on first paint at every viewport (length 4 / 10). Draft `updated_at` stayed `2026-11-19T15:29:47.87Z` through the name check. Account id unchanged. `details_submitted` stayed false.
- Consent and terms checkboxes are visible. Date-of-birth control is visible. Five phase chips fit on tablet and phone without horizontal scrolling.
- Autosave was restored after the run.
- Production Stripe.js publishable key is live mode, so a supplier IBAN can be tokenized against this account when submission is approved.
- On a 390px screen the last company row starts under the footer and scrolls clear. The card can scroll.

Screenshots from the run stay local and are not in git.

## Still open on the live account

Stripe still asks for the company director, the company tax ID, the director’s name, the director’s date of birth, a bank account, and terms acceptance. No identity document is currently due.

The date of birth is not stored. No bank account is on file. The tax ID that will be sent is the Finnish business ID already on the verified company record, checked again at send time.

If Stripe later asks for a liveness check, a selfie, or a risk review, that step stays with Stripe.

Payouts stay off while both gates are 0. Completing verification does not open them. The earlier test-mode account with transfers active is a different account.

## Supplier-driven LIVE submission

Run this only after an explicit approval to submit. Use the existing supplier login. Stay on `acct_1UdHT6C7oDQnLYSF`. Do not create another account, do not turn payout gates on, and do not move funds.

1. Open `https://partner.traverion.com/partner/onboarding`.
2. **Company.** Read the verified card. Continue only advances to Documents.
3. **Documents.** Confirm the registration file. Continue advances to Identity.
4. **Identity.** Confirm the saved name. Enter the date of birth. Keep Director checked when this person is a director. Set Owner and the ownership percent when they own the company. Add every other owner with name, date of birth, and percent. Tick **Send for verification**. Continue sends the verified company record and this person.
5. **Bank.** Leave the account holder as the verified legal name. Enter the IBAN. Tick **Accept the terms**. Continue tokenizes the IBAN and records the terms acceptance.
6. **Status.** Leave the page on Verification pending. It updates from webhook writes about every 20 seconds. Use the notices above when Stripe clears the requirements, asks for more information, or — after a separate decision to open the gates — when payouts are available.

Pressing Continue on Identity or Bank in that live session is the submission. Certification did not press it.
