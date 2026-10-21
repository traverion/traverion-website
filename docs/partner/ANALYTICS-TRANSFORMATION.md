# Partner Analytics transform

`/partner/performance` is now a five-section Analytics workspace: **Summary**, **Sales**, **Bookings**, **Customers**, **Supplier Score**.

## Financial truth

Same definitions as Income & Payouts:

- Paid inclusion: `isCollectedBooking`
- Money: `booking_commercial_snapshots.remaining_*_minor` when present; otherwise legacy `amount_paid`
- Currencies are never FX-blended
- Stay service date = check-in (`booking_date`); tours = departure date

## Tracking

Migration `20261021133417_listing_traffic_events.sql` adds `listing_traffic_events` for impression / view / book_start / book_complete (no PII). Client hooks fire from Home (impression), TourDetails / StayDetails (view + book_start).

Until the migration is applied on the Traverion production project, Bookings → Customer journey shows: “Tracking data is not yet available for this period.”

## Limitations

- Customer markets: booking country is not reliably stored yet — honest empty state
- No fabricated composite Supplier Score — verified ratings + operational metrics only
- Traffic history starts when the table is live; no retroactive impressions
