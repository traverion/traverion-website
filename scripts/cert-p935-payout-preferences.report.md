# P9.35 — Payout settings

Income & Payouts → Settings now edits payout frequency and the minimum payout directly. Saving uses the shared toast. The six-step payout wizard is no longer opened from supplier navigation. A verified supplier who opens onboarding is returned home. Home explains a platform hold as: “Your payout account is approved. Payouts are not available yet.”

Deployment: `4ed63352` on `main`.

The live check switched payout frequency, confirmed it after refresh, then restored the original frequency and minimum. The connected account, verification status, bank field, and payout gates were unchanged. Gates stayed at 0.

| Scenario | Result |
| --- | --- |
| Home explains that payouts are not available yet | PASS |
| Home has no take-action button | PASS |
| Settings has no payout wizard | PASS |
| Bank status stays visible | PASS |
| Saved frequency stays selected | PASS |
| Saved frequency is stored | PASS |
| Verified supplier leaves onboarding | PASS |
| Original payout preferences restored | PASS |
| Connected account and verification unchanged | PASS |
| Payout gates unchanged | PASS |

10/10 PASS.

Unverified, action-required, and pending states keep the Take action path only when the supplier still has something to submit. Those states are covered by `src/lib/supplier-verification-state.test.ts` and were not applied to the live account.
