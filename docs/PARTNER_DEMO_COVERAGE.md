# Partner demo fixture — coverage & functional gaps

**Created:** 2026-09-19  
**Scripts:** `npm run partner-demo:seed` / `npm run partner-demo:reset`  
**Guards:** `ALLOW_PARTNER_DEMO_SEED=1` / `ALLOW_PARTNER_DEMO_RESET=1` + `SUPABASE_SERVICE_ROLE_KEY`

## Safety model

| Control | Detail |
|--------|--------|
| Isolation | Dedicated supplier `aurora-ops@partner-demo.traverion.invalid` |
| Tags | Listings tagged `__traverion_partner_demo__` |
| Emails | All guest/traveler addresses use `@partner-demo.traverion.invalid` (undeliverable) |
| Payments | `cs_test_demo_*` checkout ids only; amounts are TEST sandbox labels |
| Side effects | Direct DB inserts via service role — no Resend, no Stripe API, no Edge Function invokes |
| Reset | Deletes only demo supplier listings/bookings/messages/reviews/discounts + demo auth users |

**Risk:** Published demo listings can appear on the traveler catalog until reset. Prefer seed only on shared staging/dev projects; always run reset after review.

## Login

- Email: `aurora-ops@partner-demo.traverion.invalid`
- Password: `PartnerDemo!Traverion2026`

## Fixture scenarios

### Business
- Verified company profile (Aurora Lapland Experiences Oy)
- Verified payout IBAN/BIC (demo values)
- Insurance fields populated

### Listings
1. Guaranteed Northern Lights Tour (published, pickup configured, shared + private options)
2. Ice Fishing Experience (published, **incomplete pickup copy** → attention)
3. Ranua Wildlife Park Experience (published)
4. Private Airport Transfer (published, transportation kind)
5. Riverside Apartment · Rovaniemi (**stay** inventory family, nightly pricing)
6. Snowshoe & Campfire (**draft**)

### Bookings
- Today: shared NL, private NL, ice fishing (pickup gap)
- Tomorrow: NL + airport transfer
- Next week: Ranua family booking
- Stay: 3-night reservation starting +3 days
- Unpaid open checkout
- Open cancellation request (supplier-initiated, awaiting traveler)
- Cancelled + refunded past ice fishing
- Completed past trips (for reviews / performance)
- Recently paid transfer

### Calendar / availability
- ~35 days capacity rows per product
- Blocked sample days, reduced capacity days, stay night blocks
- Occupancy `booked` hints on today NL + stay nights

### Messaging
- Answered pickup confirmation (today shared)
- **Unread** clothing question (today private)
- **Unread** stay check-in question
- Answered pickup time change (tomorrow)

### Reviews / offers
- Excellent review + supplier reply
- Short review
- Review awaiting reply
- Active / upcoming / expired percent offers on options

### Money / performance
- Paid bookings feed ledger via `record_paid_booking_earnings`
- Amounts are TEST — UI must keep Stripe TEST honesty

## Workflows exercised

Today attention, departures, week ahead, Inbox unread, Pickup gaps, Bookings filters, Calendar density, Listings draft/published/stay, Offers windows, Reviews reply, Money collected rows.

## Domain gaps (do not fake)

| Desired | Gap |
|--------|-----|
| “Temporarily unavailable” listing status | Only `draft` \| `published` |
| Ticket scanner / dispatch routing | Not in product |
| Automatic Stripe refunds | Manual Refund due only |
| Real payout schedule | Manual / review copy only |
| Experiences / packages as live traveler families | Stay + tour live; experience/package not traveler-live |
| Guaranteed “unread badge” without fetching threads | Today loads last messages for ≤40 paid bookings |

## Functional bugs / ledger notes found while building

1. **ISSUE A (preserved):** Supplier password-reset can land on Traveler `/set-password` UI — full auth-role audit still deferred (`docs/PARTNER_RECONSTRUCTION_BACKLOG.md`).
2. Auth `createUser({ id })` may be ignored by some Supabase projects — seed remaps traveler/supplier ids if needed; reset matches by email domain.
3. Demo published listings can pollute traveler catalog until reset — operational risk, not a UI bug.
