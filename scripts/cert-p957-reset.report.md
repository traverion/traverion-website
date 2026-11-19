# P9.57 — Controlled onboarding reset

**Verdict: PASS 14/14.** `contact@royalnordic.fi` opens on Company. A stale browser draft and a direct link to Status or Date of birth both land on Company. Continue, Back, and refresh were checked on desktop and on a phone-sized browser. No identity or bank request was sent.

## Database changes

Only these four columns on supplier `eced0f8c-c2e4-469b-8bba-15170be68cc1` were written. Final values at `2026-11-19T16:45:34.914Z`:

| Column | Value |
| --- | --- |
| `payout_wizard_draft` | version 1, step `business`, empty representative, no owners, no markers |
| `payout_wizard_draft_updated_at` | `2026-11-19T16:45:34.914Z` |
| `setup_progress` | version 1, phase `business` |
| `setup_progress_updated_at` | `2026-11-19T16:45:34.914Z` |

Certification autosave was cleared with the same four-column write, so the next visit still starts at Company.

Unchanged: live account `acct_1UdHT6C7oDQnLYSF`, `verification_status` verified, registration document, Connect due list, `details_submitted` false, payouts false, IBAN empty, and all three financial gates at 0.

## Rollback

The previous draft and setup progress are in `scripts/p957-onboarding-reset.backup.json`. That file stays on this machine and is not in git. Restoring it writes those two JSON values and their original timestamps back onto the same four columns.

The backup draft still has the old saved-step markers, including representative, identity, and wizard completed. The backup progress phase is `representative`.

## What the supplier sees

Company is a confirmation of the verified record. The link is rewritten to `?phase=business&screen=company`. After Continue, refresh stays on the next screen. Back returns to Company. The same check passed in a second browser that still held a 2020 draft and opened the date-of-birth link.

Screenshots: `scripts/p957-screenshots/desktop-company-from-status-link.png`, `desktop-refresh-resume.png`, and `mobile-company-from-dob-link.png`.
