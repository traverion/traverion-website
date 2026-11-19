# P9.36 — Agenda dates

Agenda lists today, even when it is empty, and later dates only when they have a booking or scheduled event. Empty days between those dates are omitted. With nothing upcoming, Agenda is today’s date and “Nothing scheduled”. Several bookings on one date stay under that date. Week and Month still show every date in the grid.

Deployment: `91839726` on `main`. Production calendar chunk: `SupplierUnifiedCalendar-DHk9XVmB.js`.

The live supplier has no listings, bookings, or conversations, so production Agenda showed only Thursday 19 November with “Nothing scheduled” on desktop and mobile. Week showed seven columns. Month showed 42 cells with today highlighted once. No records were created.

Gaps, a single future event, multiple events on one date, and a past event with empty days around it are covered by `partnerUnifiedAgendaDays` in `src/lib/partner-unified-calendar.test.ts` (21 tests passed).

40/40 PASS on `https://partner.traverion.com`.
