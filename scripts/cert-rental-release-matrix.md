# Traverion Rentals — Reliability Certification & Release Matrix

**Date:** 2026-10-25  
**Continued from:** `0950dbf93c2757436c06d7426980980e9633a210`  
**This run:** `cee9de05` in `scripts/cert-rental-reliability.report.json`  
**Linked project:** `xcopqllkulxfkpunetbc` (Traverionapp, eu-north-1)  
**Stripe:** TEST only. Endpoint `we_1TWkBwC3BaJIHpM6eVbY1DOc`, `livemode: false`.  
**Public rental checkout:** DISABLED. `RENTAL_CHECKOUT_ENABLED` was absent before and after (`flagStillAbsent: true`).  
**Publication gate:** migration 282 preserved. Published rental count 0 before and after. Cert tour and stay were unpublished before cleanup.  
**Other bookings:** 22 before and 22 after.  
**Mail sink:** `delivered@resend.dev` only. Guest auth stayed on `@example.com`. No real customer or supplier was emailed.

Checkout Session certification from run `ee85074e` (`scripts/cert-rental-checkout-session.report.json`) was not rebuilt. Session `cs_test_a11rvZtBbLFQCFqmqsqjVgzrnVlpv6prEXDBwcYnvKWN1xO1zsPnQVyrjb` remains the prior passing signed-webhook proof.

## Commands

```bash
node scripts/cert-rental-reliability.mjs
# run cee9de05 — all steps ok

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
# completed
```

## Email diagnosis

Resend domain `traverion.com` is `verified`. A direct POST to an `@example.com` address returned HTTP 422: `Invalid to field. Please use our testing email address instead of domains like example.com.` That is the cause of the earlier failed certification rows. The sender domain and the notify templates are not the failure.

Provider acceptance (`transactional_email_log.status = sent` plus a Resend id) and delivery (`GET /emails/{id}` `last_event`) are recorded separately. Every id below was `sent` and then `last_event = delivered`, and the recipient was the Resend test sink.

| Message | Acceptance id | Delivery | Path |
| --- | --- | --- | --- |
| Customer confirmation | `01a17487-b211-71e5-b695-be66248c899e` | delivered | Local `notify-customer-booking` (same code). Subject contains the cert listing title. |
| Supplier new booking | `01a17487-b7c4-7086-86ca-252efdacd866` | delivered | Local `notify-supplier-event` |
| Customer cancellation | `01a17487-f6db-7cef-ad67-97b41873eee4` | delivered | Local notify. Subject `Your booking has been cancelled · TV-WL25454W` |
| Supplier cancellation | `01a17487-fa2d-753a-b298-9561f261d7f7` | delivered | Local supplier notify |
| Customer refund started | `01a17488-0cf9-7443-b6f7-cecfb3b6c29d` | delivered | Hosted `execute-booking-refund` |
| Customer refund complete | `01a17488-1504-78c1-8a38-a3df7c1fc26c` | delivered | Hosted `execute-booking-refund` |
| Supplier refund started | `01a17488-1c61-74af-a7d7-031abb5a118c` | delivered | Hosted refund path |
| Supplier refund complete | `01a17488-2f55-7811-9176-89ecbf8c788f` | delivered | Hosted refund path |

The hosted paid-webhook retry did not write `booking_confirmed_paid` or `new_booking`, and it wrote no `notify_*` payment event. `hostedAcceptedBeforeFallback` was `[]`. The only payment event on that booking before the local fallback was `payment_intent.succeeded`, inserted before the earnings error. Refund replay returned success and did not create a second Stripe refund (`re_3UUX31C3BaJIHpM61qEfBDXM`, reason `requested_by_customer`, 2500 cents, test mode).

## Release matrix

| Check | Result | Evidence |
| --- | --- | --- |
| `@example.com` failures are Resend's test-address rejection | **PASS** | HTTP 422 with Resend's testing-address message. Domain `traverion.com` verified. |
| Confirmation, supplier, cancellation, and refund content can be delivered | **PASS** | Eight ids above. Acceptance `sent`. `last_event` `delivered`. Sink only. |
| Hosted webhook sends confirmation after the earnings failure is repaired | **FAIL** | Retry processed, snapshot created, no notify event and no hosted email row. |
| Pickup reminder date, zone, recipient, rental copy | **PASS** | Helsinki tomorrow `2026-10-26`. One send. Body has that date, `Europe/Helsinki`, and rental wording. `last_event` delivered. |
| Return reminder | **PASS** | One return send, same date and zone, `last_event` delivered. Pickup count stayed 0 on that call. |
| Timezone control | **PASS** | Pacific/Kiritimati local date was already `2026-10-26`. Same pickup calendar day sent 0. |
| Cancelled booking suppressed | **PASS** | Scoped run sent 0. No mail row. |
| Duplicate reminder | **PASS** | Second pickup call `remindersSent: 0`. |
| Reminder auth | **PASS** | Missing bearer 401. Wrong bearer 401. |
| Scheduled path isolated from real bookings | **PASS** | Local `send-booking-reminders` with `onlyBookingIds` (1–4 ids). Empty `{}` still means a full scan in code. Production workflow was not dispatched. |
| Database failure after Stripe success | **PASS** | Supplier profile removed. `evt_1UUX32C3BaJIHpM6Wl94sbVF` failed on `booking_commercial_snapshots_supplier_id_fkey`. Booking `d3e0c558-92fb-46db-b3e3-c72cd5d41740` stayed `confirmed` / `paid`. |
| Paid-but-unconfirmed earnings gap is visible | **PASS** | `earnings_missing` while the snapshot was absent. Migration 290. |
| Idempotent promotion and one inventory claim | **PASS** | After profile restore and event retry: 1 confirmed hold, 1 snapshot, 1 earning item. |
| Safe refund, no second charge | **PASS** | One test refund `re_3UUX31C3BaJIHpM61qEfBDXM` for 2500. Replay did not add another. |
| Tour Checkout, signed webhook, refund | **PASS** | `cs_test_a1QnyIFfca0ap3e4KdLN8kysoi4WgvPf4RuPDfWZgaolDSqQzZDIfIoezc`, booking `8e1e37eb-5620-4e8c-b895-f0bb867023f3`, confirmed, refund HTTP 200, then listing `draft`. Charge `pi_3UUX5ZC3BaJIHpM614DDno50` refunded 3000/3000, test mode. |
| Stay Checkout, signed webhook, refund | **PASS** | `cs_test_a1ec4QIXMulD5WygaIO1AEm9VPzDGjWdAv8TQiPOeu33FnaledlobcCj80`, booking `fc3052f2-ba95-4f1e-8ab1-df67b7bc565f`, confirmed, refund HTTP 200. Charge `pi_3UUX6AC3BaJIHpM60iDapPTM` refunded 8000/8000, test mode. |
| Live supplier or guest contacted | **PASS** (not contacted) | Fixtures only. Live stay `e21b231b-392a-4912-ba7f-07f7b181a564` was not used. |
| Admin exception inbox | **PASS** | Staff magic-link session, not an email. Admin HTTP 200. Guest JWT HTTP 403. Kinds on the cert rows: `stuck_hold`, `pending_hold_expired`, `paid_unconfirmed`, `failed_refund`. |
| Stuck-hold recovery | **PASS** | `expire_stale_rental_holds` moved the hold to `expired`. Events include `checkout_released`. No second hold. |
| Admin recovery does not double-charge or double-refund | **PASS** | Expire does not create a PaymentIntent. Refund replay left a single refund. |
| `financial_audit_log` for this recovery | **NOT TESTED** as a writer | Delta 0. This action records `rental_booking_events`, not `financial_audit_log`. |
| Admin bookings panel in the browser | **NOT TESTED** | The edge action was called with the staff JWT. The React panel was not clicked. |
| Production reminder cron | **NOT TESTED** | Isolated function only, so real bookings were not scanned. |
| `RENTAL_CHECKOUT_ENABLED` unset | **PASS** | Secret absent after the run. |
| Migration 282 and no published rental | **PASS** | Published rental count 0. Cert listings deleted. |
| Automated regression | **PASS** | 77 tests passed. |
| Production build | **PASS** | `npx vite build` completed. |

## Production release verdict

**NOT READY for public rental payments.**

Keep `RENTAL_CHECKOUT_ENABLED` unset. Do not lift migration 282.

The money path recovers: a missing supplier profile fails the webhook in the open, the booking stays paid with one confirmed hold, `earnings_missing` is visible, and the Stripe retry writes one snapshot and one earning item. Tour and stay test Checkout, confirmation, and refund passed on isolated fixtures. Mail delivery works when the notify functions run, including hosted refund mail. Pickup and return reminders are correct in an isolated scheduled invocation.

**Blocker before enablement:** after the earnings failure is repaired, the hosted webhook retry does not send the customer confirmation or the supplier new-booking email. That side effect was proven only by invoking the notify functions directly. Public rental checkout stays off until that webhook path is shown to write the email, or until an operator accepts a manual notify step for that recovery. Enabling the flag still needs an explicit decision of its own.
