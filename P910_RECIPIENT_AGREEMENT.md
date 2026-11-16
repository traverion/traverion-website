# P9.10 — Recipient agreement readiness

**Date:** 2026-11-16  
**Onboarding function:** `connect-supplier-onboarding` version 28  
**Verdict:** **NO-GO** for the first LIVE Accounts v2 account.

No LIVE account was created. The request stopped during the wizard-consistency sentence. This pass covers the recipient agreement and the native acceptance step.

## Which agreement

Accounts with no Stripe Dashboard do not get a Stripe-hosted agreement. Stripe’s API-onboarding rule is that the platform presents the agreement and attests that the supplier accepted it.

Traverion’s new-supplier configuration cannot take card payments and uses dashboard none, so the documented agreement is the recipient agreement, not the full Connected Account Agreement. The missing agreement enum is not treated as proof of either type. The page shown is Stripe’s own recipient notice:

https://stripe.com/legal/connect-account/recipient

Stripe’s privacy policy is linked beside it. The disclosure on the identity step is Stripe’s published recipient wording with Traverion and suppliers in the placeholders. Traverion does not host its own copy of the legal text.

## How acceptance is recorded

Stripe’s v2 example records an ISO timestamp and IP address at `identity.attestations.terms_of_service.account`. A TEST update of `acct_1UcWUMC3Batf5jGY` also accepted `user_agent` and returned that field. Stripe’s how-to requires date and IP. Traverion records the user agent as well and submits it when the browser sends one.

A placeholder address `0.0.0.0` is rejected before Stripe. The checkbox is not prechecked, including after a saved draft is restored. The server accepts only `tos_accepted: true` together with agreement version `stripe-recipient-notice-2026-11-16`. It writes the version, URL, timestamp, IP, and user agent to `financial_audit_log` before the Stripe update.

Renewed acceptance is required when ownership changes, when the verified tax id changes, and whenever Stripe puts the agreement back into the account requirements. The identity step says so when those requirement keys are present, and the supplier must check the box again.

Express accounts still collect acceptance in Stripe’s own step. That path returns before any recipient audit row or v2 update.

## Production safety

The creation gate is unchanged at 0, the allowlist is empty, and Royal Nordic remains the Express account `acct_1UcAxbCOlSVGqrHJ`. Payout flags were not enabled. No LIVE account was created.

The logged-in wizard was not clicked through in a browser. The links, unchecked consent, version, and server order are covered by tests.
