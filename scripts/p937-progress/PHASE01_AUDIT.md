# P9.37 Phase 01 — Complete Platform Audit

| | |
|---|---|
| Status | **DONE** |
| Date | 2026-11-18 |
| Baselines | `scripts/p937-screenshots/baseline/*-{desktop,tablet,mobile}.png` |

## Route inventory

### Public / traveler (`traverion.com`)
| Path | Page id | Notes |
|---|---|---|
| `/` | home | Hero + destinations |
| `/tours`, `/packages` | packages | Discovery catalog |
| `/stays` | stays | Stay catalog |
| `/rentals` | rentals | Rental catalog |
| `/tour/:uuid`, `/tours/:uuid` | packages (deep link) | PDP via query rewrite |
| `/stay/:uuid`, `/stays/:uuid` | stays (deep link) | Stay PDP |
| `/rentals/:uuid` | rental-details | Rental PDP |
| `/cart` | cart | Reservation cart |
| `/booking-confirmed` | booking-confirmed | Stripe return |
| `/account`, `/wishlist`, `/bookings`, `/trips` | account surfaces | Auth-gated |
| `/login`, `/sign-up`, `/auth` | auth | Traveler auth |
| `/about`, `/blog`, `/contact`, `/privacy`, `/terms`, `/cookies`, `/affiliate`, `/content-creator`, `/sitemap`, `/legal-notice` | content/legal | Marketing |
| `/destinations/:slug` | destination | Destination pages |

### Partner (`partner.traverion.com`)
See `TRANSFORM3_SUPPLIER_ROUTES` in `src/lib/partner-transform-3.audit.ts` (≥18 sections): Home, Listings, Inbox, Bookings, Availability, Pickups, Reservations, Stay Calendar, Income, Verification, Analytics, Reviews, Offers, Support, Settings, Account, Create, Onboarding, Password.

Auth entry: `/login`, `/signup`, `/reset-password`, `/email-verified`, `/for-partners`.

### Admin (`admin.traverion.com`)
| Path | Notes |
|---|---|
| `/login` | Staff login |
| `/admin` | Admin shell — verification queues, suppliers, ops |

## Design foundations found
- Dual token systems: `--tv-*` (traveler) and `--partner-*` (supplier shell) in `src/index.css` (~23k lines).
- Type: Plus Jakarta Sans + Fraunces (good); residual **Inter Display** in header chrome (~line 3967).
- Controls: traveler pills (`--tv-radius-pill`); partner soft radii (`0.5rem`) — intentional product split.
- Motion/elevation tokens already present (`--tv-elev-0..4`, `--tv-duration-*`).

## Baseline issues (to fix in later phases)
1. Residual Inter Display / Inter references break type consistency.
2. Token dualism causes occasional spacing/radius mismatches between public and partner.
3. Some consumer CTAs still use heavy pill + shadow stacks.
4. Partner vs public visual language needs a shared accent/ink contract (already close: Finland navy `#073b83` / `#003580`).
5. Forms/wizards vary in progress chrome and sticky footer patterns.
6. Admin tables denser / less aligned with partner card language.
7. Mobile: catalog filters and sticky booking bars need overflow/focus cert (Phase 19).

## Baseline screenshots captured
home, tours, stays, rentals, about, partner-login × desktop/tablet/mobile (18 files).
