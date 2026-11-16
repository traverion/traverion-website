# P9.5 — Native Connect architecture decision

**Date:** 2026-11-16
**Project:** Traverionapp `xcopqllkulxfkpunetbc`
**LIVE accounts created:** none
**Gate left:** `live_custom_onboarding_enabled = 0`, allowlist empty
**Payout flags:** all off

## Recommendation

**Target for new suppliers:** Accounts v2 recipient account with `dashboard: "none"`, `losses_collector: "application"`, `fees_collector: "application"`, and `stripe_balance.stripe_transfers` requested. Do not request the merchant configuration or `card_payments`.

That is the only documented combination that makes Traverion the requirements collector. It is the current form of the responsibility shape already certified on TEST Custom accounts: platform-collected requirements, no Stripe Dashboard, and platform liability for negative balances.

**NO-GO** for a LIVE pilot in this mission.

**GO** to keep Royal Nordic on its existing Express account, keep the creation gate off, and keep payout flags off.

The production onboarding code still creates Accounts v1 Custom accounts, and only when the gate is on. This decision does not switch that code. The next implementation step is a TEST-mode v2 create and retrieve, still with no LIVE account.

---

## 1. What LIVE confirms

Read-only `GET /v2/core/accounts` on the production live secret, `Stripe-Version: 2026-09-30.preview`, returned HTTP 200. No account was created. The inspector was deleted. The endpoint now returns 404.

| Account | livemode | Configurations | Dashboard | Fees | Losses | Requirements |
| --- | --- | --- | --- | --- | --- | --- |
| `acct_1UcAxbCOlSVGqrHJ` Royal Nordic | true | `recipient` | `express` | `application_express` | `application` | `stripe` |
| `acct_1UcBXT2FvgTkBmd2` legacy Express | true | `recipient` | `express` | `application_express` | `application` | `stripe` |

P9.4 already confirmed the platform `acct_1TFXp1CJawbWge6X` is Finland, with charges, payouts, and `transfers` active. Royal Nordic’s v1 `transfers` capability is inactive while requirements are past due.

The v2 list did not expand capability status (`include` is not a valid list parameter on this version). Transfer inactivity remains the P9.4 v1 read.

Supplier countries in production: one profile has address country Finland and `connect_country` FI. Two profiles have neither set. No Sweden, Norway, Denmark, Estonia, or Germany supplier is stored.

---

## 2. Architecture comparison

| | Legacy Custom (v1) | Accounts v2, platform-collected | Existing Express |
| --- | --- | --- | --- |
| Create shape | `type: custom`. Stripe marks this legacy. | `POST /v2/core/accounts`. Recipient configuration, `dashboard: none`, both collectors `application`. | v1 Express, now visible in v2 as `dashboard: express` and `requirements_collector: stripe`. |
| Native business and representative forms | Supported. TEST wizard passed. | Supported, because the platform is the requirements collector. | Stripe collects these. Traverion can embed Stripe’s form. |
| Bank collection | Stripe.js bank token, then attach. TEST attached an EUR token. Raw IBAN is not stored. | Same responsibility when the platform collects requirements. Balance Settings and the external account are platform-managed when there is no Dashboard. | Stripe collects the bank. The platform can still set the payout schedule. |
| Payout schedule | Platform sets it. | Platform sets it through the Balance Settings API. | Platform can schedule payouts. The supplier manages the bank in Express. |
| Stripe Dashboard | None on the certified TEST account. | `none`. The platform must supply status, remediation, and payout explanation. | Express Dashboard exists. |
| Stripe login popup | Not required for accounts where the platform collects requirements, when `disable_stripe_user_authentication` is set. | Same rule. Stripe’s embedded-component guide says authentication is required where Stripe collects requirement updates. | Required for sensitive embeds. Royal Nordic already shows this popup. |
| Ongoing verification | Platform must follow `requirements` and `future_requirements`. | Listen for v2 requirement updates. Embedded `notification_banner` and `account_onboarding` can sit inside Traverion and stay current as rules change. | Stripe collects changes. |
| Compliance | Platform collects KYC and attests Terms of Service. Stripe still verifies and can demand a document. Platform owns negative balances. | Same. Stripe assigns `requirements_collector: application` only when losses sit with the platform and dashboard is `none`. | Stripe collects KYC and Terms. Platform still owns losses on the LIVE accounts (`losses_collector: application`). |
| Complexity | Already built and TEST-certified. Deprecated create path. Directors and executives remained due after the six steps on the Finnish TEST company. | New create and requirement model. Same wizard. Stripe recommends embedded remediation because API-only onboarding cannot clear a risk review and requirements change by country. | Lowest build cost. Fails the native-UX goal for new suppliers. |
| Migration | Cannot be converted into v2 dimensions in place. | New accounts only. v2 can read the existing Express accounts. It does not change their dashboard or collector. | Leave in place. A later move is a new account and a new onboarding. |

Charge pattern stays separate charges and transfers. The platform remains merchant of record. Do not send `application_fee_amount` on that pattern. Do not request merchant `card_payments` on a supplier account.

---

## 3. Capability matrix

| Capability | Confirmed on LIVE | Documented | Certified in TEST | Unverified |
| --- | --- | --- | --- | --- |
| Finland Connect platform with transfers active | Yes | — | TEST platform is a different account | — |
| Accounts v2 API accepts a read | Yes, HTTP 200, both Express accounts, `livemode: true` | v2 is the current Connect API | — | — |
| Platform-collected requirements | No such account exists on LIVE | Only `losses_collector: application` plus `dashboard: none` | v1 Custom `requirement_collection: application` | A LIVE v2 create. Empty results do not prove creation is refused. |
| No Stripe Dashboard | Express dashboard is what LIVE has | `dashboard: none` | TEST Custom `dashboard: none` | LIVE v2 create |
| No Stripe authentication popup | Express accounts require it | `disable_stripe_user_authentication` works where the platform collects requirements | Express popup reproduced for Stripe-collected accounts | A dashboard-none Account Session on LIVE |
| Native business and representative forms | Express accounts are Stripe-collected | Platform builds the forms and submits them | TEST wizard submitted both | LIVE v2 |
| Bank token, no stored IBAN | Not exercised on LIVE | Platform manages the external account when dashboard is `none` | TEST `btok_` attached, EUR, test bank | LIVE bank token on a v2 account |
| Platform-controlled payout schedule | Not changed | Balance Settings API when dashboard is `none` | — | LIVE schedule write |
| Ongoing verification inside Traverion | Express requirements are Stripe-owned | Platform must handle updates; embedded banner stays in the page for dashboard-none accounts | TEST wizard resumes due requirements | LIVE v2 webhooks |
| Finland company directors and executives | Royal Nordic is still due representative, bank, and Terms fields | Requirements depend on country, business type, capabilities, and agreement | TEST Finnish company still had director and executive requirements after the six steps | The exact live field list for a new v2 company |
| Other supplier countries | No non-FI supplier country is stored | An EEA platform can pay connected accounts in the EEA, UK, US, Canada, and Switzerland. A recipient service agreement cannot use those Connect cross-border payouts. | TEST account is FI | Which agreement Stripe assigns to a v2 recipient account, and therefore whether a non-FI supplier can be paid with Connect |

---

## 4. Country limits

Finland is the operating country. The LIVE platform and both connected accounts are Finnish, and the only populated supplier country is FI. Domestic supplier payouts are the scope that LIVE and TEST have both touched.

Stripe’s cross-border payout guide allows a platform in the EEA to pay connected accounts in the EEA, the UK, the US, Canada, and Switzerland, on separate charges and transfers without `on_behalf_of`. The same guide says a recipient service agreement cannot use that cross-border product. Accounts v2 chooses the service agreement automatically, and choosing a recipient agreement explicitly is an Accounts v1 operation. Until a TEST v2 account shows its agreement, a supplier outside Finland is out of scope.

EU platforms also sit under DAC7-style reporting. Stripe’s platform tax reporting product is a private preview and collects through Stripe interfaces. A dashboard-none integration has to plan for that collection itself. It does not change the account configuration.

Åland is outside ordinary Finnish VAT handling in Stripe Tax. That is a tax rule, not a Connect account-country block.

---

## 5. Target supplier experience

One step at a time, Traverion chrome, draft saved as the supplier moves, progress visible on every step.

1. **Business.** Legal name, country, address, tax or registration identifier, business type. Submit to the connected account. Lock confirmed fields and still allow a later correction when Stripe marks one due.
2. **Representative.** Name, date of birth, email, address, ownership. Company accounts must be ready for directors and executives, because the Finnish TEST company was asked for both after the representative step.
3. **Identity.** Traverion explains what Stripe is checking. Keyed data stays on the previous steps. A document, proof of address, or liveness check opens Stripe’s embedded verification inside this step. That is the Stripe-controlled exception. Risk-review outcomes also stay with Stripe; API updates cannot clear them.
4. **Bank.** Stripe.js creates a bank token in the browser. Traverion sends the token and stores only the display-safe result Stripe returns, such as bank name and last4. The raw account number is not stored.
5. **Preferences.** Traverion payout frequency and commission choice. The Stripe payout schedule is a separate platform setting and stays unchanged until payouts are explicitly enabled.
6. **Review.** Show what is still due, what Stripe is reviewing, and that payouts are off. “Verified” means the recipient `stripe_transfers` capability is active. A completed form does not mean that.

Express suppliers keep this shell. Their sensitive steps remain Stripe embeds and may ask the supplier to sign in to Stripe. New v2 suppliers do not get that login when the platform is the requirements collector and Stripe authentication is disabled. Traverion should require its own authenticated session, and Stripe recommends 2FA when the platform takes that authentication duty.

Terms of Service are accepted in Traverion on the API path: the platform attests date and IP. Embedded onboarding can also present Stripe’s agreement. Do not claim the supplier never sees Stripe if a document or risk check is required.

---

## 6. Compliance and security

- Traverion collects and submits KYC, owns negative-balance liability, and monitors fraud. Stripe’s verification does not replace the platform’s own fraud duty.
- Stripe decides capability status, can request further documents, and can pause payouts when requirements age.
- Identity images and bank secrets stay out of Traverion tables and logs.
- The connected account has no Stripe Dashboard login, so statements, status, and remediation have to live in Traverion.
- Requirement updates are ongoing. The Identity or Review step must reopen when `requirements` or `future_requirements` change. European accounts without a Stripe Dashboard are treated as inactive on a 240-day clock if they have no payout, payment, or transfer activity.
- Existing Express accounts keep Stripe as the requirements collector. Do not send them through the platform-collected form path.

---

## 7. Implementation path

1. Leave `live_custom_onboarding_enabled` at 0 and the allowlist empty.
2. On the existing TEST platform, create one Accounts v2 recipient account with `dashboard: none`, both collectors `application`, and `stripe_transfers` requested. Retrieve `requirements_collector`. Stop if it is not `application`.
3. Point new-supplier onboarding at that create shape. Keep the six-step wizard, the Express branch, and the pre-Stripe LIVE gate.
4. Use embedded Stripe UI only for document, liveness, and risk remediation, with `disable_stripe_user_authentication` where the account configuration allows it.
5. After that TEST retrieve matches, a separate approval can authorize one LIVE pilot account. This mission does not authorize it.

Royal Nordic stays on `acct_1UcAxbCOlSVGqrHJ`. An existing Express supplier cannot adopt the new architecture by editing the current account. Doing so later means a new connected account and a fresh onboarding, with the Express account left untouched until that work is approved on its own. No Express supplier is migrated here.

## Official references

- [Connected account configuration (Accounts v2)](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration)
- [Create a marketplace connected account](https://docs.stripe.com/connect/marketplace/tasks/create)
- [Pay out to connected accounts](https://docs.stripe.com/connect/marketplace/tasks/payout)
- [Embedded onboarding (Accounts v2)](https://docs.stripe.com/connect/embedded-onboarding?accounts-namespace=v2)
- [Identity verification](https://docs.stripe.com/connect/identity-verification)
- [Connect embedded components — user authentication](https://docs.stripe.com/connect/get-started-connect-embedded-components)
- [disable_stripe_user_authentication](https://docs.stripe.com/changelog/acacia/2024-10-28/disable-stripe-user-authentication-account-sessions)
- [Service agreement types](https://docs.stripe.com/connect/service-agreement-types)
- [Cross-border payouts](https://docs.stripe.com/connect/connect-cross-border-payouts)
- [Custom onboarding methods](https://docs.stripe.com/connect/custom/onboarding) — legacy account types; Stripe directs new work to Accounts v2

## Stop

No LIVE account was created. No account was migrated. No transfer, READY period, or payout was activated. The gate and allowlist were left untouched.
