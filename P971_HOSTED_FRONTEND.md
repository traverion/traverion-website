# P9.7.1 — Hosted frontend certification

**Date:** 2026-11-16  
**Commit:** `0ef2ef7d`  
**Hosted site:** `https://partner.traverion.com`  
**Deployment:** GitHub production deployment `7836146654`, state success  
**Edge function:** `connect-supplier-onboarding` version 26  
**Verdict:** **PASS** for the hosted frontend. **NO-GO** to enable LIVE account creation or payouts.

## Deployment

The push of `0ef2ef7d` was already built and marked successful. The live partner bundle is `SupplierVerificationPage-BlVmivuA.js`. It sets the opening step to bank only when the URL asks for `focus=bank`; otherwise the saved draft step is used. The bundle’s Supabase host is `xcopqllkulxfkpunetbc` only. It does not contain the staging project.

No Stripe credentials and no creation-gate settings were changed.

## Hosted browser — Royal Nordic Express

Signed in as the existing Royal Nordic supplier on `partner.traverion.com`. Continue was not used, so no onboarding request was sent and no verification data was submitted.

| Check | Result |
| --- | --- |
| Wizard loads | PASS — six steps, “Set up payouts” |
| Express path kept | PASS — company fields locked, with the secure identity and bank notice |
| Save and resume | PASS — a preferences draft survived refresh on the preferences step |
| Refresh step | PASS — refresh stayed on preferences instead of forcing Business |
| Validation | Not re-fired on this locked company form. The empty-name message was confirmed again on the TEST supplier |
| Mobile | PASS — 390px layout, Save & exit, Back, Continue |
| Stripe login | PASS — no Stripe sign-in page during ordinary navigation |
| Duplicate account | PASS — the function was not called; the mapping stayed the Express account |

The minimum typed in the draft was 45. It was not submitted. The stored Royal Nordic minimum is still 0 and the payout cycle is still monthly.

## New suppliers

Two production profiles have no connected account. Their creation endpoint was not called. Opening and refreshing the wizard produced no request to `connect-supplier-onboarding`. The server gate remains the block: flag 0 and an empty allowlist, checked before any Stripe create.

## TEST regression

Local partner app on `127.0.0.1:5197`, staging only, existing account `acct_1UcWUMC3Batf5jGY`.

| Check | Result |
| --- | --- |
| Six steps listed | PASS |
| Empty legal name | PASS — “Enter the legal business name.” |
| Bank on file | PASS |
| Resume | PASS — refresh opened the bank step |
| Production host contacted | No |

No second TEST account was created.

## Production safety after the session

| Check | Result |
| --- | --- |
| LIVE gate | 0 |
| Allowlist | 0 |
| Royal Nordic | Express `acct_1UcAxbCOlSVGqrHJ`, livemode true |
| Connected-account mappings | 1 |
| Earnings | 11 items, 85232 minor units |
| Payout flags | all 0 |
| READY periods and transfers | 0 and 0 |

## Recommendation

**PASS** — the hosted partner frontend includes the resume-step fix and does not point at staging.  
**NO-GO** — do not turn on LIVE supplier creation or payouts.
