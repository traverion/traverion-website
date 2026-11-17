# P9.27 — Premium Tour Pages & Booking Form

| Field | Value |
| --- | --- |
| Result | **PASS** (presentation) · **PARTIAL** live production catalog |
| Continues from | `b9eb82b3` |
| Cert environment | Local seed (`VITE_SHOW_SEED_LISTINGS=true` :5181) + production empty-catalog check |

## Shipped

- Cleaner tour discovery cards (no redundant Tour chip / tag clutter; image fallback)
- Shared PDP primitives: `ListingPdpCollapsible`, `ListingPdpFaq`
- Tour detail FAQ + progressive disclosure for overview / good-to-know
- Unified booking field chrome (`tv-booking-field`) + “Book this tour” panel kicker
- Fixed seed/non-UUID tour detail mounting + listing resolve (no PostgREST uuid errors)
- Seed capacity/offers no longer false “unavailable / checking…”

## Screenshots

- `scripts/p927-screenshots/before/tours-discovery-prod-empty.png`
- `scripts/p927-screenshots/after/tours-discovery.png`
- `scripts/p927-screenshots/after/tour-detail-booking-desktop.png`
- `scripts/p927-screenshots/after/tour-detail-booking-mobile.png` (if captured)

## Constraints held

- No payment / commission / refund / financial calculation changes
- No invented production bookings or availability
- Disabled products not enabled

## Blockers

- Production `listings` catalog currently has **0 published tours** — live traveler booking cert on prod blocked until operators publish.
- Full Stripe checkout not exercised on seed listings (by design — not real inventory).
