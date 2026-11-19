# P9.36 — Persistent page layouts

Calendar, Bookings, Listings, and Inbox keep their operational chrome when there is nothing to show. Empty copy sits inside the content area. Search and filters stay usable, and a failed bookings load stays distinct from an empty list.

Deployment: `ba43d241` on `main`. Production chunks include `SupplierUnifiedCalendar-rsJXhunK.js`, `SupplierBookings-BLggIB6W.js`, `SupplierListings-BaBqxFSS.js`, and `SupplierInbox-CKDcibmH.js`.

The live supplier currently has no listings, bookings, or conversations. No records were created or deleted. Desktop (1440) and mobile (390) both kept Agenda, Week, and Month, Today, filters, the bookings workspace, the listings toolbar, and both inbox panels. Agenda for 19 November 2026 showed the date and “Nothing scheduled”. Week rendered seven columns. Month rendered 42 cells with today highlighted once. A search that matches nothing stays inside the same workspace and switches to the filtered-empty message. Aborting the listings request on Bookings shows “Bookings unavailable” and does not show “No bookings yet”.

One scheduled item among empty agenda dates is covered by `partnerUnifiedAgendaDays` in `src/lib/partner-unified-calendar.test.ts`. Mixed tour, stay, and rental events remain covered by the existing calendar unit tests. Those populated cases were not present on this live account.

38/38 PASS.
