# Partner reconstruction — deferred functional backlog

**Recorded:** 2026-09-19  
**Branch:** `reconstruction/phase-0-audit`  
**Starting SHA (Partner visual mission):** `cbe5d914f899b4e3b0887171f3cd5448f97e7a27`

These issues are **deferred**. Do **not** solve them during the Partner visual/IA reconstruction unless a UI change would otherwise break something.

---

## ISSUE A — Account type / password reset integrity

**Observed:** A supplier password-reset flow produced a link that opened `/set-password` with traveler UI (“TRAVELER ACCOUNT”, “This reset link is not valid”, “Back to traveler sign in”).

**Later functional mission must audit the full auth lifecycle:**

- supplier forgot password → backend verifies supplier context → correct reset email → correct secure destination → supplier UI → password changed → correct login return  
- if no supplier account for the email: deliberate policy (not accidental traveler context)  
- traveler signup / signin / forgot / reset  
- supplier signup/onboarding / signin / forgot / reset  
- admin auth  
- expired / used / invalid links  
- cross-account email collisions  
- redirects, session restoration, email templates, account-type context, error states  

**Status:** DEFERRED — do not fix in Partner visual / demo missions unless it blocks seeding.

**Reconfirmed 2026-09-19 during Partner demo fixture work:** still recorded; not solved.

---

## ISSUE B — Booking reminder cron (GitHub Actions)

**Deferred steps:**

1. Merge/push `.github/workflows/booking-reminders.yml` onto `main`  
2. Create GitHub Actions secret `BOOKING_REMINDER_CRON_SECRET` using the **rotated** Supabase cron secret (never reuse the previously leaked value)  
3. Actions → Booking reminders → Run workflow  

**Already verified:** direct Edge Function call returned `ok: true`, `remindersSent: 0`, `reviewsSent: 0`, `errors: []` (0 sends expected when nothing eligible / already marked).

**Status:** DEFERRED — do not work on this during Partner visual mission.

---

## ISSUE C — Future functional integrity program

After visual reconstruction, systematically audit workflow integrity:

buttons, redirects, account context, validation, dead dropdowns, forms, errors, state, confirmations, mobile failures, booking/listing/calendar/message/finance/auth/notification edge cases.

**Standard:** “If a normal user reasonably expects something to work, it works.”

**Status:** DEFERRED — not yet.

---

## Phase 1 scope reminder

Partner / supplier **visual system + information architecture only**.  
Do not reconstruct Traveler or Admin. Do not start deep functional integrity until the founder visually approves Partner.
