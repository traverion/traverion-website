# P9.54 — Final onboarding polish and LIVE readiness

**Verdict: PASS for the production UI. LIVE submission is not approved.**

Layout certification on `c7c7c394`: **64/64** at 1440, 768, and 390. No Stripe onboarding frame. No identity or bank submission. The same live account stayed in place, the money gates stayed at 0, and the saved wizard was restored. A follow-up check on `402a3c21` confirmed the saved representative name is already in the identity fields when that step opens. Screenshots stay local in `scripts/p953-screenshots/` and are not in git.

## What changed

- At 768 and 390, all five steps are a single grid: Company, Documents, Identity, Bank, Status. Nothing is hidden in a sideways scroller.
- Identity groups the person, then Director and Owner as two choices. The date field matches the other fields. The director choice is saved with the draft.
- The action row sits directly under the card on short steps and stays pinned while a longer step scrolls.
- Opening a step no longer flashes “Progress saved” before anything changed. Validation focuses the field without a smooth jump. Invalid fields use the same red border as the message under them.
- The bank account holder is filled from the verified legal name. A saved identity draft is applied from the profile immediately, including the representative name. The full date of birth is still not stored on the server, so that field stays empty until the supplier enters it. No bank number is stored.

## LIVE preflight (read only)

The check read the supplier profile mirror. It did not call Stripe, submit identity, attach a bank, or change gates. Mirror synced at `2026-11-19T15:01:38Z`.

| Check | Result |
| --- | --- |
| Account | `acct_1UdHT6C7oDQnLYSF`, custom, livemode, restricted |
| Details submitted / payouts / charges | No / no / no |
| Business review | Verified company |
| Company record on file | Legal name, brand, registration number, directors, address, phone, registration file |
| Separate tax ID column | Empty. Stripe still lists company tax ID as due |
| Saved identity draft | Name saved. Owner choice saved. No date of birth. Director choice not in the older draft |
| Saved bank | None |
| Gates | All 0 |

Stripe still requires: company director, company tax ID, director name, director date of birth, bank account, and terms.

## Approval checkpoint

Do not run this sequence until it is explicitly approved. Each step writes to the existing live account. It must reuse `acct_1UdHT6C7oDQnLYSF` and must not create another account. The money gates stay off, so a finished verification still does not enable payouts.

1. **Company.** Send the verified legal name, address, phone, and Finnish business ID already on the Traverion profile. The supplier confirms that this record may be sent. They do not retype it. This is what clears the company tax ID requirement.
2. **Identity.** The supplier confirms the person’s legal name, enters the date of birth, and confirms director and ownership. Any other owner needs a name, date of birth, and ownership percent. Address and phone are reused.
3. **Bank.** The account holder stays the verified legal name. The supplier enters the IBAN and confirms it is the company’s account. The browser tokenizes it. Traverion does not keep the number.
4. **Terms.** The supplier accepts. The acceptance time and IP are recorded then.
5. **Review.** Stripe decides verification. Traverion shows verification pending until Stripe says the requirements are clear. Payouts become available only after Stripe enables transfers and both Traverion payout gates are opened by a separate decision.

Genuine supplier input: confirmation to send the company record, the acting person’s name and date of birth, director and ownership answers, the IBAN, and terms. Everything else is already on the verified profile.
