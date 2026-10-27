# Traverion Rentals — Controlled Launch Checklist

Owner authorization for production activation was granted 2026-10-27. App/migration code to lift gate 282 ships as migration **291**. Production secret set + `db push` still require Traverion org CLI privileges (see `scripts/cert-rental-production-launch-report.md`).

~~Rental **publication** (migration 282) and production **`RENTAL_CHECKOUT_ENABLED`** stay off until each gate below is explicitly authorized.~~

## Pre-flight (no activation)

- [ ] Staging rental Stripe certification green (signed webhooks; production webhooks **not** disabled).
- [ ] Production `stripe-webhook` / `create-booking-checkout-session` / `reconcile-checkout-session` include env ownership guard (`traverion_supabase_project_ref` + missing-booking ignore).
- [ ] Prefer **separate Stripe TEST accounts** for staging vs production; if shared, ownership guard is mandatory.
- [ ] Tours + stays shared-checkout regression green in isolated test mode.
- [ ] Typecheck / unit / production build reviewed; known residual errors listed, not hidden.
- [ ] Staging RLS / advisor warnings reviewed; no staging-only security shortcuts on production secrets.
- [ ] Production secrets: `RENTAL_CHECKOUT_ENABLED` **absent**; live Stripe keys **absent**.

## Migration verification

- [ ] Confirm rental claim/window/promote migrations applied on the target project (including claim window guard).
- [ ] Confirm migration **282** still blocks public rental publication until intentionally lifted.
- [ ] Spot-check `promote_paid_checkout_booking` rental path and cancel/release inventory RPCs.

## Edge Function versions

- [ ] Record deployed versions for: `create-booking-checkout-session`, `stripe-webhook`, `reconcile-checkout-session`, `notify-customer-booking`, `notify-supplier-event`.
- [ ] Confirm staging vs production versions intentionally aligned for shared checkout code.

## Stripe webhook configuration

- [ ] Production webhook endpoint enabled and pointed at production project only.
- [ ] Staging webhook endpoint uses staging signing secret / project URL only.
- [ ] Signing secrets match the endpoint that receives events (never swap across envs).
- [ ] Smoke: signed test event with foreign `traverion_supabase_project_ref` → **ignored**, no refund.

## Supplier commercial terms

- [ ] Commission / freeze path exercised on a non-prod rental booking.
- [ ] Supplier earning snapshot written only after paid promote.
- [ ] Connect payout readiness checked for pilot suppliers (test mode).

## Rental listing timezone validation

- [ ] Listing timezone set and used for calendar-day windows.
- [ ] Pickup/return window validation refuses ambiguous / crossed DST edges as designed.
- [ ] Cert fixture dates remain far-future calendar-day only.

## Publication gate activation (authorized only)

- [ ] Explicit founder authorization recorded.
- [ ] Lift or replace migration 282 publication block **only** after authorization.
- [ ] Pilot listings reviewed; no mass publish.

## Checkout capability activation (authorized only)

- [ ] Explicit founder authorization recorded.
- [ ] Set production `RENTAL_CHECKOUT_ENABLED=1` **only** after authorization.
- [ ] Capability probe returns true on production; false again after emergency unset.

## Initial monitoring (first 24h)

- [ ] Watch `stripe_webhook_events` for `ignored` + `foreign_project_ref` / `booking_not_in_this_environment`.
- [ ] Watch refund rate, inventory conflicts, promote failures.
- [ ] Watch notify-customer / notify-supplier delivery (or log_only if still staged).
- [ ] Confirm no production webhook endpoint disabled by automation.

## Emergency checkout shutdown

1. Unset / remove production secret `RENTAL_CHECKOUT_ENABLED` (capability probe → false).
2. Leave Stripe webhook **enabled** (do not disable endpoints).
3. Optionally unpublish pilot rental listings; keep migration/publication gate if still present.
4. Page on-call; capture failing `event.id` / `booking_id` / Checkout Session ids (no PAN/PII in logs).

## Refund and inventory recovery

- [ ] Identify affected Checkout Sessions / PaymentIntents in Stripe Dashboard (test or live as authorized).
- [ ] Confirm booking `payment_status` vs Stripe charge state before issuing manual refunds.
- [ ] Release or expire rental inventory holds for unpaid / cancelled rows.
- [ ] Re-run reconcile only for known owned sessions in the correct project.

## Rollback steps

1. Remove `RENTAL_CHECKOUT_ENABLED` from production (if set).
2. Re-apply publication gate if it was lifted.
3. Redeploy last known-good Edge Function versions from git tag/SHA.
4. Do **not** disable production Stripe webhooks as a rollback tool.
5. Document residual open Checkout Sessions and inventory holds; drain with expire + release.
