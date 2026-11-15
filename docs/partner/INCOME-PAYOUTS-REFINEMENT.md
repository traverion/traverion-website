# Income & Payouts refinement

Partner Income & Payouts UI — Overview redesigned around payout eligibility (not period sales reporting). Accounting formulas, commission, payout execution flags, and database schemas for bank transfers were not changed.

## Overview (current)

- **Next payout — eligible:** cleared, unallocated supplier net + booking count. Transfer date only when confirmed.
- **Awaiting clearance:** pending earnings until service completion / clearance.
- **Next payout details:** preference (monthly 15% / twice monthly 18% from active terms), preparation status, confirmed schedule, payout account verification.
- **Eligible bookings** list (allocated rows leave this list; earning records remain).
- **Last completed payout** with statement access after confirmation.

## Documents

- One **payout statement** per confirmed payout period (not booking-level).
- **Payment confirmations** only when a transfer is confirmed.
- Booking-level commercial splits stay on **Earnings**.

## Unchanged / disabled

- Automatic bank transfers remain disabled until Traverion enables them for the account.
- Preference and threshold saves do not alter contractual commission or start payouts.
- Admin allocation / mark-paid RPCs stay service-role; one earning item allocates once (`on conflict (earning_item_id)`).
- Period sales/earnings RPCs remain in the database for reporting but no longer drive the partner Overview.
