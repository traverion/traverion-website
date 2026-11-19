# P9.34 — Supplier status

Home now shows two compact indicators under the KPI cards. Account operational is green when verification has passed. Payouts operational is green only when that account can receive payouts and both payout gates are open. A closed platform gate is explained without an action button. The large verification card, the verification page in normal navigation, and the Income verification summary are gone. `/partner/verification` opens Business settings.

## Root cause

Business Settings was still reading the old manual payout review. On the live account that review was empty: `payout_verification_status` was null, and both legacy IBAN and BIC were blank. The provider account was already connected, details were submitted, payout capability was enabled, and onboarding was complete. Company verification was `verified`. Income used that provider record and showed the bank as connected. Business Settings required a stored IBAN and BIC, so it showed Payouts Incomplete and an empty bank field.

Payout sending is a separate switch. `payout_execution_enabled` and `stripe_connect_transfers_enabled` are both 0, so a verified account is operational and payouts are not.

## Live check

Deployment: `5b9de0a1` on `main`. Layout: `SupplierLayout-wMrHnPLt.js`.

The live account was not modified. Gates, the connected account, and bank details were left as they were.

| Scenario | Result |
| --- | --- |
| Home account operational | PASS |
| Home payouts not operational while gates are closed | PASS |
| Home does not offer an action button | PASS |
| Home has no verification page link | PASS |
| Status sits below the KPI cards | PASS |
| Business settings shows one verified status | PASS |
| Business settings bank is connected | PASS |
| Business settings does not say payouts are incomplete | PASS |
| Business settings does not say the bank account is missing | PASS |
| Income overview matches payouts not operational | PASS |
| Income settings drops the verification card | PASS |
| Income settings does not claim a missing bank | PASS |
| Verification route opens business settings | PASS |
| Status fits a phone width | PASS |
| Reduced motion skips the pulse | PASS |

15/15 PASS.

Pending, restricted, action-required, and payouts-enabled states are covered by `src/lib/supplier-verification-state.test.ts` (11 tests). Those states were not applied to the live account.
