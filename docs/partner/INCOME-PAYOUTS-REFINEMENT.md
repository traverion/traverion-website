# Income & Payouts refinement

Partner Income & Payouts UI polish (Overview, Earnings, Payouts, Documents, Settings). Accounting, payout execution, commercial terms, and database schemas were not changed.

## What changed

- Shared navy/white foundation: metric cards, status chips, drawers, empty states, preference cards, export menu, reduced-motion support.
- Overview: clearer total / pending / available / paid metrics; payout summary; clickable recent earnings and payouts (no charts).
- Earnings: labeled filter toolbar; compact Export menu (30d / 90d / all); keyboard-accessible rows; detail drawer with gross, commission, net, adjustments when present (never invented).
- Payouts: centered empty state with entrance animation; status chips for scheduled / processing / paid / failed; covered transactions in the drawer.
- Documents: compact icon rows; aligned View / Download; empty state when filters match nothing.
- Settings (~1180px): bank, preference cards with catalog 15% / 18% and info tips, threshold with currency, saved preference vs active agreement distinction. Threshold remains a saved preference, not an active payout rule.

## Limitations (unchanged)

- Guest checkout may still be Stripe test mode; amounts are not bank transfers until live payouts are enabled.
- Preference and threshold saves do not alter contractual commission or start payouts.
- Gross/commission appear only when a commercial snapshot exists for the booking.
- Payout “Paid” requires a recorded completion timestamp.
