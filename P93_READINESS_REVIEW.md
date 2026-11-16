# P9.3 — Production architecture review

**Date:** 2026-11-16  
**Mode:** read-only source review. No accounts created, no database writes, no deploys, no credentials or verification documents inspected.  
**Prior evidence used only as context:** P9.2 TEST certification (`acct_1UcUkO2HdgQeyOEp` on staging). This review does not re-run Stripe or production queries.

## Verdict

| Decision | Result |
| --- | --- |
| Keep production payout execution off and leave existing LIVE Express mappings in place | **GO** |
| Ship Custom-native onboarding to production partners | **NO-GO** |
| Create or migrate LIVE connected accounts | **NO-GO** |
| Enable transfers, READY periods, or payout execution | **NO-GO** |

Custom-native onboarding is certified on Stripe TEST. The production path is a different configuration: the live platform secret, a live publishable key the bank tokenizer refuses, and an account-create path that has no feature flag.

---

## 1. Six-step wizard

Source: `src/lib/payout-setup-wizard.ts`, `src/components/supplier/PayoutSetupWizard.tsx`, entry from `IncomeFinancialSettings` and `SupplierVerificationPage`.

| Step | Collector | What is persisted |
| --- | --- | --- |
| Business | Traverion | `supplier_profiles` company fields, then Custom `accounts.update` |
| Representative | Traverion for Custom; Stripe embed for Express | Stripe Person. Name also copied to `managing_directors` |
| Identity | TOS for Custom; Stripe embed for Express | `tos_acceptance.date` + IP on the connected account |
| Bank | Stripe.js `btok_` then `external_accounts` for Custom; embed for Express | Token only. UI keeps last four digits in memory |
| Preferences | Traverion | `payment_cycle`, `payout_threshold_min` |
| Review | Status mirror | Refresh calls `connect-supplier-onboarding` `refresh` |

Routing is by `connect_account_type`:

- `custom` → API actions `submit_business`, `submit_representative`, `accept_tos`, `attach_bank_token`.
- `express` → same shell, Stripe Account Session (auth window allowed). Hosted Account Link is the fallback if the session cannot be created.
- No account yet → treated as Custom (`isCustom = type === 'custom' || !isExpress`). The first successful business Continue calls `ensure_account`, which creates a connected account.

Draft resume is `sessionStorage` (`tv-payout-wizard:v2:{userId}`). Refresh in the same tab restores the step and representative fields. A new browser does not. Business and preferences can be reconstructed from `supplier_profiles`. Representative date of birth, email, and ownership are not read back from Stripe, so a new session shows an empty representative form even after a successful submit.

Opening the wizard does not create an account. Continuing from business does.

---

## 2. TEST vs production configuration

| Concern | TEST (certified) | Production code path |
| --- | --- | --- |
| Platform secret | `sk_test` via `resolveStripeMoneySecretFromEnv` | `sk_live`. Mode is the secret, not the UI |
| Publishable key | Must match mode or the edge returns 503 | Partner Stripe.js helper `getTraverionStripeJs` loads **only** a `pk_test` key. A live publishable key returns “Payment configuration is unavailable.” Custom bank attach cannot run on the production frontend |
| New account type | `accounts.create` `type: 'custom'`, `capabilities.transfers.requested`. Stripe default for this type is platform-collected requirements and no Dashboard. P9.2 observed `requirement_collection=application`, `dashboard=none` | Same create params. The create call does **not** set `controller`. If Custom create throws and the platform is LIVE, the edge **falls back to Express** and stores that account |
| TEST failure | Custom create error is returned. No Express fallback | Express fallback is LIVE-only |
| Livemode | TEST ids are archived if seen on a LIVE platform | LIVE Express is reused. Missing `livemode` on retrieve is treated as LIVE when the platform secret is live |
| Transfers | `execute-supplier-transfers` returns before any transfer unless mode is `test` **and** `stripe_connect_transfers_enabled = 1` | Live mode is hard-blocked in that function, independent of the flag |
| “Verified” | TEST accounts with `connect_account_livemode === false` are labeled “LIVE onboarding required” and cannot receive transfers | `connectCanReceiveTransfers` also requires `require_live` when the edge platform mode is live |
| Payout rail after create | Left at `manual_iban` | Same. Onboarding does not switch the rail to `stripe_connect` |

Custom support on the LIVE Connect profile is **not** proven. TEST success does not establish it. The Express fallback would hide a LIVE Custom rejection by creating a different account type.

---

## 3. Lifecycle, authorization, isolation

Edge: `supabase/functions/connect-supplier-onboarding/index.ts`.

**Who can call it**

- Supplier JWT. Supplier id comes from `supplier_team_members` or, if absent, a profile whose id equals the user id.
- `viewer` is rejected (403).
- `admin_ensure_live_connect` is separate: service role or `P81_LIVE_CONNECT_BOOTSTRAP_SECRET`, LIVE secret required, and it can create a LIVE account. It is not part of the wizard. It remains a privileged create path.

**Reuse and preservation**

- Linked Custom account: retrieved and reused.
- Linked Express on a LIVE platform: returned as embedded. Not archived, not replaced.
- LIVE + `connect_legacy_account_id`: restore that account. If restore fails, refuse to create a second LIVE account.
- TEST Express with zero transfer and bank-payout attempts: `ensure_account` archives the link and creates Custom. `start_native_custom` is the explicit version and refuses `livemode === true`.
- Unique index `supplier_profiles_stripe_connected_account_uidx` prevents two suppliers sharing one account id.
- Metadata `traverion_supplier_id` is checked when present. An untagged account is still accepted.

**Royal Nordic**

Code preservation is by type and livemode, not by a hardcoded allow-list. The frozen Express id in `CONNECT_NATIVE_ONBOARDING.frozenLiveExpressAccountId` (`acct_1UcAxbCOlSVGqrHJ`) is a decision-record constant. `ensure_account` on a LIVE Express link returns that link. `start_native_custom` refuses live accounts. This review did not re-read the production row.

**Idempotency gap**

Reuse is “if this profile already has an account id.” There is no Stripe idempotency key. Two concurrent first Continues can create two Stripe accounts; the unique index only stops the second profile update. The first Stripe account can be left unlinked.

**Ownership gap**

`supplier_team_members` is read with `maybeSingle()` and no role ordering. A user on more than one supplier can resolve ambiguously. Untagged connected accounts skip the supplier-metadata check.

---

## 4. Validation, errors, recovery

Present and adequate for the TEST happy path:

- Business: legal name, type, street, city, postal code, country (normalized client-side).
- Representative: first name, last name, `YYYY-MM-DD`. Server repeats name and DOB presence.
- Identity: TOS checkbox required before `accept_tos`.
- Bank: holder + IBAN required; token must start with `btok_` or `tok_`; Stripe rejects a bad token.
- Preferences: monthly or twice monthly; threshold parsed and bounded in the wizard helper.
- Express API mutations return 409 so Custom writers do not overwrite an Express account.
- Status is mirrored from Account retrieve, not from the form submit.
- `rejected` and `restricted` map to “Restricted” / “Action required.” Due requirements block `connectCanReceiveTransfers`.
- Review copy states execution is separately controlled.
- Errors shown in the wizard pass through `userFacingError`, which hides long and technical messages.

Gaps before production Custom:

1. **No document recovery in the wizard.** `submit_identity_file` exists on the edge. The six-step Custom UI never calls it. If Stripe later sets `individual.verification.document` or `verification.document`, the review step says information is under review and offers Refresh. It does not collect the document. P9.1 already records proof-of-liveness as a provider-controlled exception.
2. **Representative form is not rebuilt from Stripe** after sessionStorage is gone.
3. **`owners_provided`, `directors_provided`, and `executives_provided` are set true** on every representative submit, including when percent ownership is missing or additional owners are required.
4. **No server check** for age, ISO country, email format, or ownership percent 0–100.
5. **Business Continue treats a 409 / “express” error as success** and advances. Combined with the LIVE Express fallback, a failed Custom create becomes a silent embedded path.
6. **`connect_disabled_reason` is not shown** on the wizard review list. The settings surface uses a generic restricted message.
7. **Draft includes date of birth in sessionStorage.** Full IBAN is not in the draft and is cleared after tokenization. Business `tax_id` can be stored on `supplier_profiles` (registration/tax identifier, not a document image).
8. **Edge `catch` returns `e.message`.** The wizard sanitizes many of those strings; other clients of the function would see Stripe text.
9. **No structured handling** for Stripe rate limits or partial failure after Person create but before `owners_provided`.

---

## 5. Feature gates and defaults

Seeded fail-closed (`value_int = 0`):

| Key | Migration | What it blocks |
| --- | --- | --- |
| `stripe_connect_transfers_enabled` | `273_connect_payout_foundation.sql` | TEST transfers and reversals. Live mode is rejected in code even if this is later set to 1 |
| `payout_execution_enabled` | `300_b2b94_payout_gates_and_tour_fulfillment.sql` | Mark-paid and Connect transfer execution |
| `payout_auto_prepare_enabled` | `307_p4_payout_hardening.sql` | Automatic payout preparation |
| `payout_pilot_prepare_enabled` | `309` / `310` | Non-dry-run pilot prepare |

None of these gates `ensure_account`. A production supplier who completes business details creates a LIVE connected account while every money gate stays off. `payout_rail` stays `manual_iban`. `connect_debit_negative_balances` defaults false.

This review did not read the live `commercial_runtime_config` table. Defaults and code paths are fail-closed. Last observed production values (P9.2, not re-queried here) were `0`.

---

## 6. Existing supplier mappings

Designed behavior, unchanged by this review:

- Active `stripe_connected_account_id` for Custom is reused.
- LIVE Express is not archived by `ensure_account` or `start_native_custom`.
- A previous LIVE id parked in `connect_legacy_account_id` is restored instead of creating another LIVE account.
- Account id uniqueness is enforced in the database.
- Creating an account does not flip `payout_rail` to `stripe_connect` and does not enable transfers.

No production mapping was written or re-fetched in this review.

---

## 7. Approval dependencies

These need an explicit decision before any production Custom rollout:

1. **LIVE Connect profile** allows Custom accounts with platform requirement collection and no Stripe Dashboard, using the same capabilities (`transfers` only, MCC `4722`, country from the supplier profile, default `FI`).
2. **Remove or keep the LIVE Express fallback.** Today a Custom failure creates Express.
3. **A feature flag in front of `ensure_account` create**, default off, so opening payout setup on production cannot mint LIVE accounts.
4. **LIVE Stripe.js tokenization** (or another Stripe-supported collection method). Current `createBankAccountToken` refuses non-test publishable keys on purpose.
5. **Connected Account Agreement** presentation and record (date + IP) accepted by compliance for LIVE, including the named Stripe disclosure already in `PAYOUT_WIZARD_TOS_COPY`.
6. **Identity exception policy** when Stripe requires a document or liveness check the wizard cannot collect.
7. **Beneficial-ownership rules** before the platform attests `owners_provided`.
8. **Idempotency key** (or a create lock) so a double submit cannot orphan a LIVE account.
9. **Payout execution, transfers, READY periods, and Royal Nordic migration** stay separate approvals. Architecture record `CONNECT_NATIVE_ONBOARDING.goNoGo` already marks those NO-GO.
10. **`admin_ensure_live_connect`** stays unused unless a named supplier and operator approval exist. It can create LIVE Custom or Express and returns an Account Link.

---

## Test recommendations (do not run against LIVE)

1. Repeat the P9.2 six-step TEST supplier on staging after any wizard or edge change. Confirm the same account id on the second `ensure_account`.
2. On TEST, submit a bad `btok_` and a representative missing DOB. Confirm 400 and no profile IBAN column.
3. On TEST, force `requirements.currently_due` to include a document key (Stripe test values) and confirm the wizard does not claim “Complete” while due items remain.
4. On TEST, call `start_native_custom` against an Express account marked live and confirm 503 with the link unchanged.
5. Contract-test the LIVE branch with a stub: Custom `accounts.create` throws → assert the code would create Express, and treat that as a release blocker until the fallback is removed or flagged.
6. Contract-test `createBankAccountToken` with a live-shaped publishable key → must refuse.
7. Confirm `execute-supplier-transfers` still returns immediately when mode is live.
8. Two parallel `ensure_account` calls for one unlinked TEST supplier → document whether a second Stripe account is orphaned.
9. Browser: refresh mid-wizard, Back from bank, Express auth notice, and a 390px viewport. Desktop and mobile were exercised in P9.2 for the TEST supplier only.
10. After any future LIVE approval, one disposable LIVE supplier only, with execution flags still 0, and a written rollback (archive link, do not delete the Stripe account if it is the only record).

---

## Production readiness

The implementation is ready to **keep serving existing LIVE Express partners inside the six-step shell**, with payout flags off and no money movement.

It is **not ready** for production Custom-native onboarding. The blockers are the unguarded LIVE create, the Express fallback, TEST-only bank tokenization, incomplete document and ownership recovery, and session-only representative state. P9.2 PASS applies to Stripe TEST. It does not extend to LIVE account creation or payout execution.
