# 02 — Consumer Audit

**Status legend:** COMPLETE · IMPLEMENTED/UNVERIFIED · PARTIAL · UI ONLY · BROKEN · MISSING · N/A  
**Runtime note:** Local Vite homepage smoke only unless noted. Stripe/auth/account journeys NOT VERIFIED in this audit session.

---

## A. Global navigation & layout

| Feature | Status | Severity | Evidence / notes |
|---------|--------|----------|------------------|
| Header / logo home | IMPLEMENTED/UNVERIFIED | — | `UnifiedHeader.tsx` |
| Explore / Tours / Stays nav | IMPLEMENTED/UNVERIFIED | — | Inter ExtraBold uppercase `.tv-header-nav__item`; centered 3-col grid |
| Header search icon → packages | IMPLEMENTED/UNVERIFIED | — | Navigates packages |
| Profile menu / auth entry | IMPLEMENTED/UNVERIFIED | — | User menu; AuthPage |
| Wishlist / Trips entry | IMPLEMENTED/UNVERIFIED | — | Nav to wishlist/bookings |
| Footer legal links | IMPLEMENTED/UNVERIFIED | — | Contact, privacy, terms, cookies, legal notice, sitemap |
| Mobile menu | IMPLEMENTED/UNVERIFIED | — | Same three nav items + auth |
| Responsive / safe-area | IMPLEMENTED/UNVERIFIED | — | CSS tokens; prior mobile tests exist |
| Accessibility (skip link, focus) | PARTIAL | P2 | Skip link present; full a11y audit NOT VERIFIED |
| Page transitions | IMPLEMENTED/UNVERIFIED | — | lux/tv-rise motion; respects reduced-motion in places |

---

## B. Explore homepage (`Home.tsx`)

| Feature | Status | Severity | Evidence |
|---------|--------|----------|----------|
| Hero + Traverion brand | IMPLEMENTED/UNVERIFIED | — | `.tv-home-hero`, veil gradients |
| Tours/Stays mode + search fields | IMPLEMENTED/UNVERIFIED | — | MarketplaceSearchBar; navigates `/packages` or `/stays` |
| Destination cards | IMPLEMENTED/UNVERIFIED | — | `tv-dest-grid`; counts from catalog |
| Destination imagery accuracy | PARTIAL→improved | P2 | `destinationCoverSrc` prefers listing photos; curated SEA only; generic fallback still Positano (`vacation1.jpg`) for unknown places without candidates |
| Recommended tours/stays | IMPLEMENTED/UNVERIFIED | — | Interest ranking local signals |
| Empty catalog fail-closed | IMPLEMENTED/UNVERIFIED | — | No seed invent when Supabase configured |
| Trust row | IMPLEMENTED/UNVERIFIED | — | Compact icons + copy |
| Performance / LCP | NOT VERIFIED | P2 | Hero image present; metrics not measured this audit |

**Local browser (2026-10-22):** Finland/Rovaniemi tiles used listing-storage images (not Positano/Halong). Search/date popover opened.

---

## C. Tours discovery (`Packages.tsx`)

| Feature | Status | Notes |
|---------|--------|-------|
| Listing grid + filters + sort | IMPLEMENTED/UNVERIFIED | MarketplaceBrowseShell |
| Location / date / guests | IMPLEMENTED/UNVERIFIED | URL-driven |
| Price / discounts / reviews | IMPLEMENTED/UNVERIFIED | Server-fetched maps; fail-closed offers |
| Favorites | IMPLEMENTED/UNVERIFIED | Wishlist hooks |
| Empty / loading | IMPLEMENTED/UNVERIFIED | Skeleton + EmptyState |
| Pagination / infinite | PARTIAL | Slice/grid patterns; not classic infinite scroll product |

---

## D. Tour detail & booking (`TourDetails.tsx`, `BookingPage.tsx`)

| Feature | Status | Severity | Notes |
|---------|--------|----------|-------|
| Gallery, copy, logistics sections | IMPLEMENTED/UNVERIFIED | — | Large PDP |
| Options / date / time / participants | IMPLEMENTED/UNVERIFIED | — | Quote-driven |
| Price honesty on quote fail | IMPLEMENTED/UNVERIFIED | — | Tests disable checkout when quote fails |
| Sticky desktop + mobile CTA | IMPLEMENTED/UNVERIFIED | — | Prior sticky tests |
| Checkout invoke | IMPLEMENTED/UNVERIFIED | P1 cert | `create-booking-checkout-session` |
| Auth mid-flow / consent | IMPLEMENTED/UNVERIFIED | — | Modal + consent flags |
| Self-book / capacity gates | IMPLEMENTED/UNVERIFIED | — | Edge + client |
| Cancel path legacy `/cart` | PARTIAL | P3 | Some cancelPath fallbacks still `/cart?...` |

**Runtime Stripe pay → webhook → Trips: NOT VERIFIED this audit.**

---

## E. Stays discovery (`Stays.tsx`)

| Feature | Status | Notes |
|---------|--------|-------|
| Search dates guests | IMPLEMENTED/UNVERIFIED | Checkout field for stays |
| Occupancy-aware browse | IMPLEMENTED/UNVERIFIED | Occupied/blocked ranges |
| Amenities / type filters | IMPLEMENTED/UNVERIFIED | Browse helpers |
| Map | MISSING / N/A | No full marketplace map product found |

---

## F. Stay detail (`StayDetails.tsx`)

| Feature | Status | Severity | Notes |
|---------|--------|----------|-------|
| Gallery, amenities, rules, safety | IMPLEMENTED/UNVERIFIED | — | Extras-driven |
| Calendar disabled nights | IMPLEMENTED/UNVERIFIED | P1 cert | Paid+authorized occupy; Instant pending does not (257) |
| Nightly + total quote | IMPLEMENTED/UNVERIFIED | — | `quoteStayNights` |
| Instant Book vs R2B CTA | IMPLEMENTED/UNVERIFIED | — | `stayStickyBookCtaLabel` |
| Private check-in until paid | IMPLEMENTED/UNVERIFIED | — | Redaction helpers |
| Known hooks/TS noise | PARTIAL | P2 | Historical StayDetails warnings; full tsc NOT clean |

---

## G. Checkout & payment (consumer-visible)

| Feature | Status | Severity | Notes |
|---------|--------|----------|-------|
| Server-authoritative quote | IMPLEMENTED/UNVERIFIED | P0 | Edge ignores client total |
| Stripe Checkout redirect | IMPLEMENTED/UNVERIFIED | P0 | TEST keys only |
| Confirmation + reconcile | IMPLEMENTED/UNVERIFIED | P0 | `BookingConfirmationPage` + reconcile function |
| Failed payment honesty | IMPLEMENTED/UNVERIFIED | P0 | Soft copy; LIVE blocked message paths |
| Duplicate payment prevention | IMPLEMENTED/UNVERIFIED | P0 | Promote short-circuit + webhook event lock |

---

## H. Account & Trips

| Feature | Status | Severity | Notes |
|---------|--------|----------|-------|
| Auth signup/login/reset | IMPLEMENTED/UNVERIFIED | P1 | AuthPage, ResetPasswordPage |
| Account hub | PARTIAL | P2 | Profile + counts; not full settings CRM |
| Trips (MyBookings) | IMPLEMENTED/UNVERIFIED | P1 | Upcoming/past/cancel/Pay now/messages |
| Wishlist | IMPLEMENTED/UNVERIFIED | — | Auth-gated |
| Tickets/vouchers PDF | PARTIAL | P2 | Receipt helpers exist; full voucher product unclear |
| Delete account / GDPR export | MISSING / PARTIAL | P2 | Not found as complete self-serve |

---

## I. Other consumer routes

| Route | Status | Notes |
|-------|--------|-------|
| `/cart` CartPage | PARTIAL | Soft-retired multi-cart; open Instant Book sessions UI; navigate('cart')→Trips |
| `/blog` | UI ONLY / COMPLETE honest empty | Not publishing |
| `/experiences` ReservedInventory | UI ONLY / COMPLETE placeholder | Not for sale |
| Legal / about / contact / affiliate / creator | IMPLEMENTED/UNVERIFIED | Static + contact RPC |
| Destination page | IMPLEMENTED/UNVERIFIED | Listing-backed hero candidates |

---

## Consumer completion estimate

- **Code coverage:** ~85% of Tours+Stays traveler journeys  
- **Verified this audit:** ~25% (homepage visual/search/destinations)  
- **Launch risk focus:** checkout certification, Trips truth, cancel/refund ops honesty, email delivery  
