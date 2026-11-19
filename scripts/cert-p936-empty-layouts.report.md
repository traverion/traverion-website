# P9.36 — Premium empty states

Partner empty states share one centered treatment: a small rounded icon, a short heading, one line of support, and a single action when an action helps. Search, filters, headers, and the calendar grids stay in place. A failed bookings load still shows “Bookings unavailable”.

Icons: Bookings uses a calendar, Listings a grid, Inbox a message square, Agenda a calendar check, Analytics a chart, and Payouts a wallet. Filtered results use their own heading, such as “No matching bookings”.

Deployment: `918a8db1` on `main`. Production calendar chunk: `SupplierUnifiedCalendar-DzNmkC4l.js`.

Desktop (1440) and mobile (390) were checked on the live supplier, which has no listings, bookings, or conversations. Agenda showed only Thursday 19 November with “Nothing scheduled”. Week kept seven columns. Month kept 42 cells and one today highlight. In dark mode the empty heading renders as light text (`rgb(244, 247, 251)`) and the icon container is 40px. Analytics and Payouts use the same empty state.

52/52 PASS on `https://partner.traverion.com`.
