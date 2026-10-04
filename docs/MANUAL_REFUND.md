# Manual refund (TEST or LIVE)

Refunds are **not** automated. Traverion can **prepare** a refund instruction (`prepare_refund_instruction` / Admin → Commercial → investigation) but does **not** call Stripe. Traverion records Stripe’s refund webhook (`charge.refunded`) when Stripe has already refunded. Do the money movement in Stripe first.

**Honesty:** Cancellation / “Refund due” ≠ “Refunded”. Only `payment_status = refunded` (or Stripe-confirmed partial shrink of `amount_paid`) is provider truth.

**Post-payout refunds:** If a supplier earning was already marked paid in a payout period, Traverion records a `supplier_recovery` ledger entry and a financial hold. It does **not** erase the historical paid period. Who ultimately bears chargeback/refund liability remains an OWNER POLICY decision.

## 1. Locate the booking in Traverion

Partner: Bookings → open the booking (reference `#N`, guest, date).  
Traveler: Trips → same booking.  
Note: `booking_number`, listing title, `checkout_session_id` / payment intent if shown, amount, currency.

## 2. Locate the payment in Stripe

Dashboard → Payments (TEST or LIVE matching the keys).  
Search the Checkout Session (`cs_test_…` / `cs_live_…`) or Payment Intent. Confirm amount and customer email.

## 3. Refund in Stripe Dashboard

Payments → the charge → **Refund**.  
**Partial refunds:** Traverion records the Stripe `charge.refunded` event, keeps `payment_status = paid` (inventory held), shrinks `amount_paid` to the remaining charge for Money Collected, and emails traveler + host (`partial_refund_recorded`). Prefer a full refund for cancelled trips.

**Full refunds:** After Stripe fully refunds, the webhook sets `payment_status = refunded`, releases occupancy, and posts an idempotent supplier ledger `refund` row that reverses `booking_earnings` (same unique key as cancel-accept reversal — no double reverse).

## 4. Record the booking in Traverion

If the webhook is configured, `payment_status` becomes `refunded` and occupancy is released.  
If the webhook has not arrived: Partner can still **cancel** the booking (status `cancelled`). Refund-due cancelled rows are excluded from collected Money; late `no_refund` cancels stay in Collected. Prefer waiting for `refunded` so Trips shows **Refunded**.

## 5. Money

Collected / pending payout **must not** include `payment_status = refunded` or cancelled bookings that are **Refund due** (`refund_choice` is not `no_refund`).  
There is no separate gross-sales ledger. **Collected** = sum of `amount_paid` on rows that are still supplier revenue: paid (not refunded), plus cancelled + paid + `refund_choice = no_refund` (late traveler cancel — Stripe keeps the charge; earnings are not reversed). Refunded and Refund-due amounts are omitted, not shown as collected revenue.

## 6. Availability

- Stay nights and tour capacity: refunded/cancelled/expired pending no longer occupy (paid + live holds).
- `listing_availability.booked` is **not** used for occupancy and is no longer incremented/decremented by Traverion (capacity column still used for partner caps).

## 7. Evidence

Keep: Stripe refund id, Traverion booking `#`, timestamp, TEST vs LIVE. Do not reuse LIVE refunds as TEST evidence.
