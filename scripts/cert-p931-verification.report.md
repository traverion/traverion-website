# P9.31 — Unified supplier verification

## Root cause

Supplier pages each chose their own label. Business settings showed one chip for the company and another for payouts, so the same account could read Verified and Incomplete together. Income used a separate payout label, and Home treated a missing legacy bank record as unfinished setup. The verification address also sent people back into onboarding.

## Change

One server-derived status is used on Home, the Verification page, Business settings, Income & Payouts, and the end of onboarding.

- Not verified — nothing has been submitted.
- Action required — the supplier still needs to provide or correct something. Outstanding items are listed in plain language.
- Verification pending — the required information is submitted and under review.
- Verified — company, identity, and the payout account have all passed.

A payout account that is still open is never labeled Verified. Income states payout availability separately. With payout gates closed, a verified account says payouts are not being sent yet.

## Safety

The live supplier record, connected account, bank field, and payout gates were not changed. No identity, terms, or bank submission was sent. Gates remain off.

## Deployment

`2783f343`, `b132fb37` on `main`.

## Results

Unit tests cover Not verified, Action required, Verification pending, and Verified, including the rule that an open payout requirement or a test account is not Verified.

The live supplier is already verified, so the production check confirms that same status on every page.

| Scenario | Result |
| --- | --- |
| Home shows Verified | PASS |
| Verification page shows Verified | PASS |
| Business settings shows Verified | PASS |
| Income shows Verified | PASS |
| All four pages match | PASS |
| Income does not promise active payouts | PASS |
| No verification or bank submission | PASS |
| Verification, account, bank, and gates unchanged | PASS |

Not verified, Action required, and Verification pending: PASS in `src/lib/supplier-verification-state.test.ts`.
