# Traverion Rentals — Payment Certification & Release Matrix

**Date:** 2026-10-25  
**Baseline HEAD (start):** `b71334cf`  
**Linked project:** `xcopqllkulxfkpunetbc` (Traverionapp, eu-north-1, ACTIVE_HEALTHY)  
**Stripe mode:** TEST only. One webhook endpoint, `livemode: false`, URL `https://xcopqllkulxfkpunetbc.supabase.co/functions/v1/stripe-webhook`.  
**Events:** `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`, `payment_intent.succeeded`, `charge.refunded`.  
**Public rental checkout:** DISABLED (`RENTAL_CHECKOUT_ENABLED` secret absent before and after the run)  
**Publication gate:** migration 282 preserved. Cert listing stayed `draft`. Published rental count stayed 0.  
**Other bookings:** 22 before and 22 after (cert rows excluded).  

## Commands run

```bash
npx supabase projects list
npx supabase db query --linked --output json \
  "select version from supabase_migrations.schema_migrations where version in ('282','283','284','285','286','287','288','289') order by 1;"
npx supabase secrets list --project-ref xcopqllkulxfkpunetbc
npx supabase functions list --project-ref xcopqllkulxfkpunetbc

# Isolated Deno process only. RENTAL_CHECKOUT_ENABLED=1 was process env, never a hosted secret.
# Signed events were delivered by Stripe to the deployed stripe-webhook.
node scripts/cert-rental-checkout-session.mjs
# Evidence: scripts/cert-rental-checkout-session.report.json  (run ee85074e)

npx vitest run \
  src/lib/rental-checkout-listing-gate.test.ts \
  src/lib/rental-booking-domain.test.ts \
  src/lib/booking-lifecycle-calendar.test.ts \
  src/lib/listingPublishGate.test.ts \
  src/lib/inventory.test.ts \
  src/lib/stay-checkout-quote-parity.cert.test.ts \
  src/lib/stay-checkout-concurrency.cert.test.ts \
  src/lib/booking-concurrency-safety.cert.test.ts \
  src/lib/checkout-inventory-concurrency.cert.test.ts
# 9 files, 77 tests passed

npx vite build

npx supabase functions deploy stripe-webhook reconcile-checkout-session create-booking-checkout-session \
  --project-ref xcopqllkulxfkpunetbc
```

## Checkout Session evidence (run `ee85074e`)

Isolated identities only: `cert-rental-guest-ee85074e@example.com` and `cert-rental-supplier-ee85074e@example.com`. Draft listing. Deleted after the run, including the supplier profile required for the earnings snapshot.

| Field | Value |
| --- | --- |
| Checkout Session | `cs_test_a11rvZtBbLFQCFqmqsqjVgzrnVlpv6prEXDBwcYnvKWN1xO1zsPnQVyrjb` |
| Amount | 2500 EUR cents (`quotedTotal` 25.00) |
| Completion | Stripe `payment_pages` confirm with a `tok_visa` PaymentMethod (test mode) |
| Booking | `e02dfd84-e1e9-4108-b046-a2c56b1a2374`, number 84, reference `TV-RMVZ97T3` |
| After webhook | `confirmed` / `paid`, one `confirmed` inventory hold |
| Webhook rows | `checkout.session.completed` `evt_1UUVpUC3BaJIHpM6LsMG8zI2` processed; `payment_intent.succeeded` `evt_3UUVpTC3BaJIHpM60I9SulQz` processed |
| Refund | `re_3UUVpTC3BaJIHpM60qKIk8cz` succeeded; booking `refunded` |
| Success page | `reconcile-checkout-session` promoted, refresh returned `alreadySettled` |

Production `create-booking-checkout-session` was called with the same body and returned HTTP 400 `This listing is not available to book.` No session was created by the hosted function.

## Defects fixed before the passing run

1. Paid promotion treated every unpublished listing as unavailable and auto-refunded. Migration 282 makes that fatal for rentals. Draft rentals are now promotable. Tours and stays still require `published`.
2. Rental Checkout `expires_at` passed an ISO string into `checkoutHoldExpiresAtUnix`, which expects epoch milliseconds and adds another hour. Stripe rejected the session. The rental path now sends the hold’s own unix timestamp.
3. A failed Stripe create called `.catch` on the Supabase RPC builder, which hid the Stripe error and skipped hold release.
4. `checkout.session.expired` marked the booking failed and left the rental hold. It now releases the hold first.

## Release matrix

| Requirement | Result | Evidence | Remaining risk |
| --- | --- | --- | --- |
| Supabase project `xcopqllkulxfkpunetbc` | **PASS** | `supabase projects list`, linked | — |
| Migrations 282–289 | **PASS** | `schema_migrations` contains all eight | — |
| Stripe webhook is test-mode and points at `stripe-webhook` | **PASS** | Endpoint `we_1TWkBwC3BaJIHpM6eVbY1DOc`, `livemode: false` | Do not add a live-mode endpoint without approval |
| `RENTAL_CHECKOUT_ENABLED` unset | **PASS** | Secrets list before and after; hosted checkout returned 400 | Setting the secret enables checkout for draft rentals |
| Publication gate 282 | **PASS** | Update to `published` raised; row stayed `draft`; published rental count 0 | — |
| Cert data cannot touch live bookings | **PASS** | Other booking count stayed 22. Recipients were only `@example.com` | A supplier profile is required or earnings insert fails the webhook |
| Real Checkout Session through application code | **PASS** | Local Deno serve of `create-booking-checkout-session` with the flag only in that process | Hosted function stays gated |
| Signed webhook promotes the booking | **PASS** | Both `checkout.session.completed` and `payment_intent.succeeded` processed. Status `confirmed`/`paid` | Reconcile can also promote; both were idempotent |
| Inventory reserved once | **PASS** | One `confirmed` hold after duplicate webhook replay | — |
| Duplicate webhook | **PASS** | Event retry left one confirmed hold | — |
| Out-of-order Checkout and PaymentIntent events | **PASS** | Both events processed; still one confirmed hold | — |
| Success page refresh | **PASS** | Second reconcile returned `alreadySettled: true` | — |
| Abandoned Checkout | **PASS** | Session expire → payment `failed`, hold `released` | — |
| Expired hold then late payment | **PASS** | Charge refunded `re_3UUVqTC3BaJIHpM60hPW1HNi`; booking cancelled, not confirmed | — |
| Two customers, last unit | **PASS** | One session created, the other `Not enough rental inventory`; reserved quantity 1 | — |
| Cancel races promotion | **PASS** | Cancelled before pay; refund `re_3UUVqgC3BaJIHpM61lEVtwao`; not confirmed | — |
| Stripe success then database outage | **NOT TESTED** | No safe way to kill Postgres mid-write. Expired-hold failure does refund rather than leave a silent paid booking | A real outage still depends on Stripe retries |
| Price tamper | **PASS** | `expectedTotal: 1` → HTTP 409 before claim | — |
| Duplicate checkout request | **PASS** | Second call reused the booking and one hold | — |
| Customer / supplier / anon visibility | **PASS** | Guest read 1 row, supplier read 1 row, anon read 0 | Browser Trips and desk were not clicked |
| RLS / service role in the browser | **PASS** | Guest JWT on admin edge HTTP 403. Guest JWT on `admin_list_rental_ops_exceptions` HTTP 403. Admin panel calls `invokeAdminEdgeFunction` with the staff session | Staff UI login **NOT TESTED** |
| Stuck hold recovery | **PASS** | View showed `stuck_hold` and `pending_hold_expired`. `expire_stale_rental_holds` moved the hold to `expired` | — |
| Cancel, refund, idempotent replay | **PASS** | Hold released. `execute-booking-refund` HTTP 200 twice. Stripe refund succeeded. Booking `refunded` | — |
| Customer and supplier mail execution | **FAIL** (delivery) | Webhook wrote `booking_confirmed_paid`, `new_booking`, `refund_initiated`, and `refund_completed` to the cert `@example.com` addresses only. Every row status was `failed` | Resend did not accept the cert sink. Real inbox delivery is unproven |
| Pickup and return reminders | **NOT TESTED** | Cron was not invoked; it would email every due real booking. Targeted notify calls returned HTTP 401 | Reminder unit tests passed. Live send did not |
| Cancellation mail | **NOT TESTED** | Direct `booking_cancelled` call returned HTTP 401. Refund mails were attempted by the webhook and failed at Resend | — |
| Email body, timezone, and date formatting | **NOT TESTED** | Booking stored number 84 and reference `TV-RMVZ97T3`. Rendered mail body was not captured | — |
| Tours and Stays Stripe Checkout E2E | **NOT TESTED** | A live test Checkout on a published tour or stay would hit this same webhook and email the real supplier and guest. `scripts/cert-stripe-stay-auto-refund.mjs` inserts against listing `e21b231b-392a-4912-ba7f-07f7b181a564` | Quote and concurrency unit tests passed (77 tests). That is not a payment journey |
| Production build | **PASS** | `npx vite build` completed | — |

## Recovery procedures

1. **Stuck held inventory:** `select * from admin_rental_ops_exceptions where exception_kind = 'stuck_hold';` then `select expire_stale_rental_holds(<listing_id>);` or `release_rental_checkout_booking(<booking_id>, 'admin_release');`
2. **Paid unconfirmed rental:** Admin edge `rental_ops_exceptions` (staff JWT only). Reconcile with `reconcile-checkout-session` or let Stripe retry `stripe-webhook`. If the hold cannot confirm, the webhook refunds the PaymentIntent.
3. **Failed refund:** `execute-booking-refund` with the booking id. The traveler JWT worked in this cert. `recover: true` stays service-role only.
4. **Earnings snapshot FK:** `record_paid_booking_earnings` inserts `booking_commercial_snapshots.supplier_id` referencing `supplier_profiles`. A rental supplier without a profile fails the webhook after payment. The booking can already be `paid`; Stripe will retry. Create the supplier profile, then let the webhook retry.
5. **Never** set `RENTAL_CHECKOUT_ENABLED=1` or publish rentals without product approval. This cert does not approve activation.

## Production release verdict

**NOT READY for public rental payments.**

The real Stripe TEST Checkout Session, signed webhook, inventory reservation, abandon, late payment, last-unit race, cancel/refund race, and idempotent refund **passed** on project `xcopqllkulxfkpunetbc` without enabling the hosted flag and without publishing a rental.

**Blockers before enablement:**

1. Resend did not deliver the cert booking, supplier, or refund emails (`transactional_email_log.status = failed`).
2. Pickup and return reminder cron was not executed.
3. Tours and Stays were not re-run through Stripe Checkout.
4. A database outage after Stripe success was not injected.
5. Explicit approval is still required to set `RENTAL_CHECKOUT_ENABLED` and to lift migration 282.
