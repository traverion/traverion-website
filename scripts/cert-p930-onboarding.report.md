# P9.30 — Onboarding completion and verification

## Root causes

- The terms step stayed in the path whenever a bank requirement was still open, and the acceptance checkbox was cleared on each load unless the server draft still held it. Returning to setup also restarted at company confirmation, so the terms step appeared again.
- The status screen used one “Verification pending” line for every connected account. Done left that screen for a dashboard that still said “Finish setup”, because the dashboard treated a missing legacy bank record as unfinished setup.
- Reopening trusted a reset-shaped draft and the browser link. It did not resume from the first requirement still open on the server.

## Fixes

- The server requirement list chooses the next step. A verified company is not shown again. Terms appear only while terms are still required, and a second click is ignored.
- Status lists company, identity, and payout account as Not started, Saved, Action required, Submitted, Pending verification, Verified, or Rejected. Labels come from the stored verification record and Stripe requirements.
- The dashboard uses the same outstanding requirement. When nothing is left to send, it says “Verification pending”. When all three are verified, the finish-setup prompt is removed.
- Done returns to the dashboard. Refresh keeps the server step. Browser back returns to the previous step.

## Safety

No identity submission, terms acceptance, or bank attachment was sent. Verification, the connected account, the bank field, payout flags, and the three payout gates were unchanged. Gates remain off.

## Deployment

`97aed0c1`, `ecb17894`, `75b926e1` on `main`. Live bundles `PartnerOnboarding-CywB1Grs.js` and `SupplierDashboard-BJ8XAYOM.js`.

## Certification

Live account had no open requirements, so the journey resumes on the verified status screen. Requirement routing for an open identity or bank step is covered by unit tests.

| Scenario | Result |
| --- | --- |
| Reopen does not start at company | PASS |
| Resume matches the server requirements | PASS |
| Status names the real outcome | PASS |
| Refresh keeps the same step | PASS |
| Done returns to the dashboard | PASS |
| No identity, terms, or bank submission | PASS |
| Dashboard does not say Finish setup | PASS |
| Dashboard copy matches the server state | PASS |
| Verification unchanged | PASS |
| Live account unchanged | PASS |
| Bank field unchanged | PASS |
| Payout flags unchanged | PASS |
| Gates unchanged | PASS |
| Session user matches supplier | PASS |

14/14 PASS.
