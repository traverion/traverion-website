# P9.52 — Native Traverion supplier onboarding

Production certification: **PASS 62/62** on 2026-11-19. Supplier EM Global Oy, existing LIVE account `acct_1UdHT6C7oDQnLYSF`. No second account, no KYC submission, no money movement. Wizard JSON restored after the browser run.

## Architecture audit

Accounts v2 for this platform collects requirements because `losses_collector` is `application` and `dashboard` is `none`. The supplier-facing form is Traverion. Stripe is updated with Accounts v2 and the Persons API.

API-updatable for the current account (all currently due, none are document scans):

- Company tax ID and director attestation (`submit_business`, representative relationship)
- Director name and date of birth (`submit_representative`)
- Terms of service (`accept_tos`)
- Bank account via a Stripe.js token (`attach_bank_token`). The IBAN is not written to Traverion tables.

Provider-controlled, and not replaced by a Traverion questionnaire:

- Stripe’s document authenticity decision and any liveness or selfie check
- `verification.document` and `additional_document` when Stripe actually requires a scan. Those bytes go only through `upload_identity_document` to Stripe Files, or stay as a named recovery state. The full embedded account-onboarding questionnaire is not mounted for custom accounts.

Express accounts still cannot be completed through this API path and keep their existing recovery. EM Global is a custom account, so that path is not used.

Payout-ready email and the in-app bell run only when `stripe_transfers` is active, the account is live, and both `payout_execution_enabled` and `stripe_connect_transfers_enabled` are on. All three money gates are 0, so no notice was sent.

## Browser result

Desktop 1440, tablet 768, and mobile 390. Company, documents, identity, bank, and status.

- One Traverion flow. Identity uses the date-of-birth picker and the director checkbox. Bank is the Traverion account-holder and IBAN form. Status says **Verification pending** and lists Stripe’s current items: company director, company tax ID, director date of birth, director name, bank account, and terms of service.
- No Connect embedded questionnaire and no “Tell us about your business” screen.
- Refresh kept the same step. Company details stayed visible. Progress stayed 2 of 4.
- Edge calls during the run were status reads only. No `ensure_account` or submit action. The same LIVE account remained restricted with payouts disabled.

Screenshots from the run are local only and are not in git.
