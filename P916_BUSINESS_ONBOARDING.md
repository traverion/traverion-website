# P9.16 — Full-Screen Business Onboarding & Admin Review Queue

**Result: PASS** (API + admin queue actionable; production build includes wizard chunk)

## What shipped

### Supplier wizard
- Route: `/partner/business-setup` (full-screen, Traverion-branded, no Stripe)
- 4 steps: identity → contact/address → documents → review & submit
- Progress rail, Back / Continue, Save & exit, localStorage draft resume
- Prefills existing `supplier_profiles` fields; single-row submit (no duplicate applications)
- Finish setup **Business → Add details** opens the wizard (not the long settings form)
- After submit, returns to Finish setup; chip shows **Under review**

### Settings separation
- Business settings remains for maintain/view
- Incomplete / rejected suppliers get a CTA into the wizard
- Pending shows Under review callout

### Admin queue
- Queue rows show brand, legal name, business type, country, submission time
- Actions: **Approve**, **Request changes** (feedback required), **Reject**
- Detail view includes verification documents + previous review history
- Decisions remain server-side via `admin-supplier-verification` + `approve_business` blockers unchanged

### Notifications
- Submit: `notify-supplier-event` (`verification_submitted`) + in-app activity + review event
- Approve / request changes / reject: email + in-app activity + `supplier_verification_review_events`
- Idempotent email markers preserved / refreshed appropriately

### Database
- Migration `20261117104929_p916_business_verification_review_events.sql` applied to production

### Edge deploys
- `admin-supplier-verification`
- `notify-supplier-event`

## Certification (`scripts/cert-p916-business-onboarding.mjs`)

| Check | Result |
|-------|--------|
| LIVE create / payout flags OFF | PASS |
| Disposable supplier submit | PASS |
| No duplicate profile | PASS |
| Visible in admin `list` queue | PASS |
| Unauthorized approve blocked (403) | PASS |
| Request changes + email | PASS |
| Cleanup disposable user | PASS |

Report: `scripts/cert-p916-business-onboarding.report.json`  
Unit: `src/lib/business-onboarding-wizard.test.ts` (3 passed)  
Build: `BusinessOnboardingWizard-*.js` emitted

## Production safety

- LIVE Accounts v2 gate OFF, allowlist empty, payout/transfer flags OFF
- No Stripe Express / Royal Nordic account mutations
- No historical financial record deletion

## Key files

- `src/lib/business-onboarding-wizard.ts`
- `src/lib/submitSupplierBusinessForReview.ts`
- `src/components/supplier/BusinessOnboardingWizard.tsx`
- `src/pages/supplier/BusinessSetupPage.tsx`
- `src/components/admin/AdminSupplierVerificationPanel.tsx`
- `supabase/functions/admin-supplier-verification/index.ts`
- `supabase/functions/notify-supplier-event/index.ts`
