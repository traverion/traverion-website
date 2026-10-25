# Traverion Rentals — Payment Certification & Release Matrix

**Date:** 2026-10-25  
**Baseline HEAD (start):** `ecbcc56f`  
**Linked project:** `xcopqllkulxfkpunetbc`  
**Stripe mode:** TEST only (`sk_test_`)  
**Public rental checkout:** DISABLED (`RENTAL_CHECKOUT_ENABLED` secret absent)  
**Publication gate:** migration 282 preserved  

## Commands run

```bash
# Baseline
git rev-parse HEAD origin/main
npx supabase secrets list --project-ref xcopqllkulxfkpunetbc   # no RENTAL_CHECKOUT_ENABLED
npx supabase db query --linked --output json \
  "select version from supabase_migrations.schema_migrations where version in ('282','283','284','285','286','287','288','289') order by 1;"

# Isolated Stripe TEST journey (claim → PI → promote → abandon → cancel → refund)
node scripts/cert-rental-stripe-journey.mjs
# Evidence: scripts/cert-rental-stripe-journey.report.json

# Inventory / cancel
bash scripts/cert-rental-claim-parallel.sh
# Cancel→hold release (mig 287 trigger)
npx supabase db query --linked --file scripts/cert-rental-cancel-release.sql

# Unit / regression (subset)
npx vitest run \
  src/lib/rental-booking-domain.test.ts \
  src/lib/booking-lifecycle-calendar.test.ts \
  src/lib/pickup-completeness.test.ts \
  src/lib/partner-booking-desk-path.test.ts \
  src/lib/listingPublishGate.test.ts \
  src/lib/inventory.test.ts

# Deployed
npx supabase functions deploy send-booking-reminders admin-supplier-verification \
  --project-ref xcopqllkulxfkpunetbc
```

## Redacted Stripe evidence (last PASS run)

| Field | Value (redacted) |
| --- | --- |
| PaymentIntent | `pi_3UUVM2C3BaJIHpM60levyO4j` |
| Refund | `re_3UUVM2C3BaJIHpM60Z29VfNg` (succeeded, 2500 EUR cents) |
| Synthetic session | `cs_test_cert_rental_*` (not a live Checkout Session) |
| Promote | `promote_paid_checkout_booking` → ok |
| Hold after pay | `confirmed` |
| Hold after cancel | `released` |
| Abandon hold | `expired` via `expire_stale_rental_holds` |

## Release matrix

| Requirement | Implemented | Test performed | Evidence | Result | Remaining risk |
| --- | --- | --- | --- | --- | --- |
| Keep public rental checkout off | Flag absent; edge checks `RENTAL_CHECKOUT_ENABLED=1` | Secrets list + cert safety probe | No `RENTAL_CHECKOUT_ENABLED` secret | **PASS** | Accidental secret add without approval |
| Preserve mig 282 publish gate | 282 applied; listingPublishGate rental branch | Unit `listingPublishGate` + DB versions | Mig 282 present; rental publish blocked | **PASS** | None for gate itself |
| Disposable isolated fixtures | Draft listing + cleanup in cert | `cert-rental-stripe-journey.mjs` | Report cleanup step | **PASS** | Cleanup failure leaves draft junk (non-financial) |
| Evaluate availability + pricing path | `evaluate_rental_availability` | Cert step | available/stock=2 | **PASS** | Edge traveler quote still gated |
| Claim inventory + pending booking | `claim_rental_checkout_booking` | Cert + parallel claim | Parallel: exactly one of two claims | **PASS** | — |
| Stripe TEST payment | PaymentIntent + `tok_visa` | Cert | PI succeeded | **PASS** | Not live Checkout Session UI |
| Promote → confirmed + hold confirmed | `promote_paid_checkout_booking` + `confirm_rental_checkout_paid` | Cert (after mig 289) | status confirmed / paid; hold confirmed | **PASS** | See webhook note below |
| Duplicate promote idempotent | Re-call promote | Cert | `already_paid` | **PASS** | — |
| Abandon / hold expiry | `expire_stale_rental_holds` | Cert | hold `expired` | **PASS** | Cron coverage of expire job not re-run here |
| Cancel releases hold | Trigger mig 287 | SQL cancel cert + paid cancel in journey | hold `released` | **PASS** | — |
| Refund instruction + Stripe refund + idempotency | `ensure_booking_cancel_refund_instruction` + Stripe refunds API | Cert | refund succeeded; idempotent replay same id | **PASS** | Live `execute-booking-refund` edge not invoked end-to-end this run |
| Paid≠confirmed silent disconnect fix | Removed invalid `bookings.updated_at` writes | Mig 289 + promote cert | Promote updates succeed | **PASS** | Historical stuck rows may need admin triage |
| Admin exception inbox | View + RPC + admin action + UI panel | Mig 288; cert probed view; functions deployed | `admin_list_rental_ops_exceptions` ok | **PASS** | Empty in quiet env; needs real exceptions to UI-verify |
| Rental pickup/return reminders | Lifecycle calendar + send-booking-reminders | Unit tests; function deployed | Rental not classified as stay; return reminder helper | **PASS** | Live cron send **NOT TESTED** (no Resend fire) |
| Customer Trips / supplier desk | Prior commits on main | Unit partner desk + classification | Code present; no browser E2E this mission | **NOT TESTED** | UI smoke still needed before public enable |
| Checkout Session + live webhook promote | Production path | Attempted earlier; webhook raced and cancelled/refunded after direct promote | Isolated PI path used instead | **NOT TESTED** | Must cert Checkout+webhook before enabling public flag |
| Tours/Stays full Stripe E2E regression | Existing stay certs on main | Not re-run this mission | Prior stay race/refund scripts exist | **NOT TESTED** | Re-run stay certs before rental public launch |
| Notifications (confirm/cancel email) | Shared notify pipeline | Not asserted in cert | — | **NOT TESTED** | Email deliverability |
| Supplier earnings ledger after rental refund | Ledger refresh paths | Not asserted | — | **NOT TESTED** | Finance desk spot-check |
| Public traveler rental checkout UI | Gated | Intentionally disabled | Flag off | **N/A (blocked by design)** | Enable only with explicit approval |

## Migrations applied this mission

| Version | Purpose |
| --- | --- |
| 288 | `admin_rental_ops_exceptions` view + `admin_list_rental_ops_exceptions` |
| 289 | Fix promote/confirm/ops_status: stop writing nonexistent `bookings.updated_at` |

## Recovery procedures

1. **Stuck held inventory:** `select * from admin_rental_ops_exceptions where exception_kind = 'stuck_hold';` then `select expire_stale_rental_holds(<listing_id>);` or `release_rental_checkout_booking(<booking_id>, 'admin_release');`
2. **Paid unconfirmed rental:** Admin panel → Rental ops exceptions → `paid_unconfirmed`. Reconcile via `reconcile-checkout-session` or service-role `promote_paid_checkout_booking` with the Stripe session/PI. If inventory cannot confirm, refund via `execute-booking-refund` / instruction queue.
3. **Failed refund:** Queue `refund_due` / `failed_refund` exception → `prepare_refund_instruction` / `execute-booking-refund` with existing idempotency key.
4. **Never** set `RENTAL_CHECKOUT_ENABLED=1` or publish rentals without a Checkout+webhook PASS and product approval.

## Production release verdict

**NOT READY for public rental payments.**  

Isolated Stripe TEST certification of claim → pay → promote → abandon → cancel → refund **PASS** with inventory reconciliation. Critical promote bug (289) fixed. Public checkout and publication remain correctly disabled.  

**Blockers before enablement:**
1. Checkout Session + `stripe-webhook` promote certification (no silent cancel/refund race).
2. Live reminder cron smoke + notification delivery check.
3. Tours/Stays Stripe regression re-run.
4. Explicit approval to set `RENTAL_CHECKOUT_ENABLED` and lift publish gate.
