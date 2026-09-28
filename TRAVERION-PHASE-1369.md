# Traverion — Phase horizon checkpoint (~1369)

**Branch:** `reconstruction/phase-0-audit`  
**HEAD:** see `git rev-parse HEAD` (Phase 1369)  
**Remote migrations:** through **196**  
**Stripe:** TEST only  

This is an interim scenery note while autonomous work continues toward the ~1500 review horizon. It is **not** the Phase 1500 certification report.

## Starting truth (this band)

- Prior band closed ~Phase 1346 (`149ca2c`), migrations through ~192.
- This band: **1347 → 1369**.

## What landed (1347–1369) — theme

### Layer A — ownership & privacy
- **1347:** Stripe cancel return carries `booking=` for multi-hold Trips targeting.
- **1348–1352:** Bound `guest_user_id` beats recycled email (checkout edges, SQL `booking_traveler_owns`, cancel/respond, reviews RLS, notify auth, review-eligibility query).
- **1358–1359:** Unpaid stay `checkInAddress` stripped in DB trigger + traveler fetches + PDP review probe.

### Layer A/B — failure honesty & inventory truth
- **1350:** Browse keep-prior capacity; never invent open inventory on failed reload.
- **1354–1355:** Pickup/Bookings/Inbox keep prior ops lists under reload/prefetch failure.
- **1356:** Home/Destination never invent catalog from localStorage on live miss.
- **1357 / 1360:** Cancelled/failed unpaid messaging is **closed**, not unlock-after-pay (UI + SQL).

### Layer B/C — conversion & trust UX
- **1353:** Accept-terms CTAs tappable (scroll to consent).
- **1361–1362:** Tour/stay sticky CTAs name capacity/availability unknown; scroll to retry.
- **1363:** PDP Saved heart waits until wishlist known for the listing.
- **1364 / 1367:** Orphan destination / stay type-amenities URL filters cleared fail-closed.
- **1365:** Clear Packages listings JSON-LD on leave.
- **1366:** Calendar/guest popovers on dialog focus stack (Escape).
- **1368:** Partner Calendar All-listings “today” = experience TZ (Helsinki default).
- **1369:** Trips tab switch clears mismatched `?booking=` deep link.

## Parked (unchanged)
Refund execution · take-rate · LIVE Stripe · rentals · `useSupplierRole` UI

## Where Traverion stands (evidence-backed)

| Area | Verdict |
|------|---------|
| Security / traveler ownership | **Strong** (bound-uid parity through messaging + cancel respond) |
| Stay private address | **Strong** (write null + DB strip + client redact) |
| Inventory browse honesty | **Strong** (fail-closed / keep-prior) |
| Booking / checkout TEST | **Strong** (TEST; season/catalog gates from prior band) |
| Supplier ops surfaces | **Improved** (lists under error; calendar today TZ) |
| Trips | **Improved** (messaging copy, cancel URL, tab deep-link) |
| Search / SEO | **Improved** (orphan filters, JSON-LD cleanup) |
| Mobile sticky book | **Improved** (honest labels + scroll) |
| A11y dialogs | **Improved** (nested Escape stack) |
| Admin / Income / Rentals | Income gross-only; rentals deferred; admin partial |
| Browser E2E | **Partial** — unit/SQL/deploy heavy this band; full browser journeys still needed toward 1500 |

## Next autonomous emphasis (toward ~1500)
Keep Layer A red-team (concurrency, purchased truth, admin), then Layer B journeys (Wishlist page, Supplier Today bulk, Trips polish), then Layer C mobile/a11y/visual passes — **without** inventing phase quotas.

When Phase ~1500 is reached, produce the full certification report required by the mission brief.
