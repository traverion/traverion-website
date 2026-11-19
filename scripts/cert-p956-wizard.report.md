# P9.56 — One-question supplier onboarding

**Verdict: PASS 193/193** at production, viewports 1440, 768, and 390. UI commit `5534148b`. The person-list fix is deployed on `connect-supplier-onboarding`.

No identity or bank details were submitted during certification. Account `acct_1UdHT6C7oDQnLYSF` is unchanged. All three money gates stayed 0.

## LIVE identity error

The failing request was `GET /v2/core/accounts/{id}/persons?limit=100`, inside the representative save, before any person was created. Accounts v2 accepts a page size from 1 to 20. The call now uses 20 and follows the next page. A repeated create of the same representative uses one idempotency key, and the screen ignores a second click while a save is in flight. If that lookup fails again, the supplier sees: “We could not save this person. Your place in the form is unchanged — try again.”

What had already been sent: the company tax ID is no longer in Stripe’s due list, and the mirror synced at 2026-11-19T16:02:05Z. The company record from the earlier step in that same Continue was accepted. The person was not. Director, date of birth, and director name are still due. There is no stored person id. `details_submitted` is still false. No bank account was attached. Payouts are still off.

## Experience

The left setup sidebar and the five phone chips are gone. Onboarding uses the same focused shell as tour creation: Exit at the top, one question, a progress line, Back and one Continue at the bottom.

Screens, in order, skipping anything already finished:

1. Confirm the verified company (legal name, business ID, city).
2. Registration document only when it is missing.
3. Confirm the saved person. Change name is available.
4. Date of birth, with the Traverion picker. The date is not stored.
5. Director, only for a company.
6. Ownership, in plain language. The share is asked only after yes. At 100 percent, other owners are skipped.
7. Other owners only when someone else holds 25 percent or more.
8. Send for verification. This is the identity submission.
9. IBAN. The holder stays the verified legal name. The number stays in memory until the next screen.
10. Accept the terms. This sends the token and the terms.
11. Verification pending, refreshed from the profile every 20 seconds.

Desktop steps fit without an inner scrollbar. Each screen has one primary button. Back and Continue were exercised on the date-of-birth step, and refresh returns to the same question. No Stripe onboarding frame appeared.

Screenshots from the run are local only: `scripts/p953-screenshots/` named by screen (`company`, `person`, `dob`, `bank`, `status`) at each viewport. Earlier sidebar shots remain beside them under the old phase names.
