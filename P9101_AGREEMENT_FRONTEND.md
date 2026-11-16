# P9.10.1 — Agreement frontend deployment

**Date:** 2026-11-16  
**Hosted deployment:** GitHub production deployment `7837080460`, commit `439f04ed`, state success  
**Hosted bundle:** `PayoutSetupWizard-CEqElZ9R.js` on `https://partner.traverion.com`  
**Agreement version:** `stripe-recipient-notice-2026-11-16` in both the hosted wizard and `connect-supplier-onboarding`  
**Production function:** version 29  
**Staging function:** version 5  
**Verdict:** **PASS** for the hosted agreement experience and the TEST consent flow. **NO-GO** for the first LIVE account.

No LIVE account was created. No LIVE agreement was submitted. Payout flags stayed off.

## Preflight

| Check | Result |
| --- | --- |
| Commit `439f04ed` | Recipient notice, privacy link, unchecked consent, server version check |
| Frontend and backend version | Same string, `stripe-recipient-notice-2026-11-16` |
| Hosted wizard before this pass | Already contained that version, the recipient URL, and the privacy URL |
| LIVE creation gate | 0 |
| Allowlist | 0 |
| Payout flags | all 0 |
| Royal Nordic | Express `acct_1UcAxbCOlSVGqrHJ`, livemode true |

The partner site is production Supabase `xcopqllkulxfkpunetbc`. The TEST supplier was certified on the local partner app at `127.0.0.1:5197`, which was pointed at staging `gedktutbpfwnstcbffsc`.

## TEST browser

Supplier `9d160fa0-bd43-4d15-8f20-1800ff12e72e`, existing account `acct_1UcWUMC3Batf5jGY`.

| Check | Result |
| --- | --- |
| Six steps | PASS |
| Consent starts unchecked | PASS |
| Continue without consent | PASS — “Accept the Stripe Recipient Agreement to continue.” |
| Saved draft cannot recheck the box | PASS — a draft stored with consent true reopened unchecked |
| Refresh | PASS — identity reopened unchecked |
| Agreement version on a valid submit | PASS — server stored `stripe-recipient-notice-2026-11-16` |
| Audit before Stripe | PASS — consent row, then `supplier_recipient_agreement_stripe_recorded` |
| Desktop and mobile | PASS — links, disclosure, Back, Continue, and Save & exit stayed usable |
| Reacceptance copy | PASS — shown when the requirement key is `terms_of_service`, then that staging value was restored to an empty list |

Stripe’s current TEST requirements do not include the agreement. The only entry is `person.documents.primary_verification`. The reacceptance sentence was shown by placing `terms_of_service` on the staging profile, not because Stripe asked again. The checkbox still had to be checked.

The browser submission and the API checks stored the request `User-Agent`. A body field named `user_agent`, a body IP, and a client `X-Forwarded-For` of `0.0.0.0` or `198.51.100.23` were not stored. The platform replaced the forwarded address before the function read it. The function still rejects `0.0.0.0` when that is the address it actually sees. Acceptance did not set `verified`; the TEST response stayed `verified: false`.

## Stripe attestation

TEST account `acct_1UcWUMC3Batf5jGY`, livemode false. The stored v2 attestation date is `2026-11-16T20:27:59.157Z` and an IP is present. Repeated updates returned HTTP 200 and did not replace that attestation. Stripe is not currently asking for the agreement again, so the existing attestation remains the one on the account. No LIVE attestation was sent.

## Security

| Check | Result |
| --- | --- |
| Missing agreement version | 400 |
| Wrong version | 400 |
| Missing consent | 400 |
| Unauthenticated call | 401 |
| Acceptance for another supplier | Rejected by construction — the supplier id comes from the signed-in membership. A body supplier id for Royal Nordic created no production or cross-supplier audit |
| Duplicate submissions | Five consent rows, one agreement version, one Stripe attestation. They do not conflict |
| Failed Stripe update | The function writes `supplier_recipient_agreement_stripe_failed` and returns the error. A live Stripe rejection was not produced: the platform IP was valid and Stripe returned 200 |
| Consent audit is not Stripe completion | The consent row is written first. `verified` stays false. A separate recorded row is written only after Stripe returns success |

## Express

Royal Nordic’s hosted wizard opened on `partner.traverion.com`. Six steps, company fields locked, and the copy says identity and bank steps are completed securely. The recipient checkbox was not shown on that business step. Continue was not clicked. The page made no request to `connect-supplier-onboarding`.

## Production safety

| Check | Result |
| --- | --- |
| LIVE gate | 0 |
| Allowlist | 0 |
| Connected accounts | 1, Royal Nordic Express |
| LIVE agreement audits | 0 |
| Earnings | 11 items, 85232 minor units |
| Payout flags | all 0 |
| READY periods and transfers | 0 and 0 |

## Remaining blockers

**NO-GO** for the first LIVE Finnish supplier. The creation gate is still off, document verification is still outstanding on the TEST account, and Stripe has not been observed replacing an existing recipient attestation when it is not requesting the agreement again.
