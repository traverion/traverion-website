# Mission 05.3 — Unsupported / deferred single-date edit actions

## Tours
**Per-departure close/reopen** is not a separate backend write.
- Day close/reopen uses `listing_availability.capacity = 0` / delete row (whole day).
- Per-departure edits support capacity + cutoff via `listing_extras.slotOverrides` with a floor of confirmed occupying guests.
- Closing a single departure without closing the day is not simulated.

## Rentals
**Unblock when only a multi-day block covers the date** is not safe in the unified day panel.
- Exact single-day blocks (`[day, day+1)`) can be created/deleted.
- Multi-day covering blocks require split/replace logic; the panel refuses and reports the gap instead of deleting a wider block.

## Notes
- Stay block/unblock occupancy guards remain client-side (same as Stay Calendar).
- Rental stock adjust uses listing-level `variants[].quantity` with a peak-concurrent reserved floor from loaded holds.
- Legacy routes `/partner/availability`, `/stay-calendar`, `/rental-calendar` remain functional.
