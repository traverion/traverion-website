# Manual refund (TEST or LIVE)

Refunds are **not** automated. Traverion records Stripe’s refund webhook (`charge.refunded`) when Stripe has already refunded. Do the money movement in Stripe first.

## 1. Locate the booking in Traverion

Partner: Bookings → open the booking (reference `#N`, guest, date).  
Traveler: Trips → same booking.  
Note: `booking_number`, listing title, `checkout_session_id` / payment intent if shown, amount, currency.

## 2. Locate the payment in Stripe

Dashboard → Payments (TEST or LIVE matching the keys).  
Search the Checkout Session (`cs_test_…` / `cs_live_…`) or Payment Intent. Confirm amount and customer email.

## 3. Refund in Stripe Dashboard

Payments → the charge → **Refund**.  
**Partial refunds:** Traverion records the Stripe `charge.refunded` event in `booking_payment_events` but keeps `payment_status = paid` and **does not** release inventory until the charge is **fully** refunded (`charge.refunded === true` or `amount_refunded >= amount`). Prefer a full refund for cancelled trips. If you must partial-refund, adjust the booking/ledger manually afterward — Money still counts the booking as collected while paid.

**Full refunds:** After Stripe fully refunds, the webhook sets `payment_status = refunded`, releases occupancy, and posts an idempotent supplier ledger `refund` row that reverses `booking_earnings` (same unique key as cancel-accept reversal — no double reverse).

## 4. Record the booking in Traverion

If the webhook is configured, `payment_status` becomes `refunded` and occupancy is released.  
If the webhook has not arrived: Partner can still **cancel** the booking (status `cancelled`). Cancelled rows are excluded from collected Money. Prefer waiting for `refunded` so Trips shows **Refunded**.

## 5. Money

Collected / pending payout **must not** include `payment_status = refunded` or `status = cancelled`.  
There is no separate gross-sales ledger. **Collected** = sum of **paid, not refunded, not cancelled** `amount_paid`. Refunded money is omitted, not shown as collected revenue.

## 6. Availability

- Stay nights and tour capacity: refunded/cancelled/expired pending no longer occupy (paid + live holds).
- `listing_availability.booked` is **not** used for occupancy and is no longer incremented/decremented by Traverion (capacity column still used for partner caps).

## 7. Evidence

Keep: Stripe refund id, Traverion booking `#`, timestamp, TEST vs LIVE. Do not reuse LIVE refunds as TEST evidence.
