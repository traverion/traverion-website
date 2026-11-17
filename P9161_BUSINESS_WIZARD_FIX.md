# P9.16.1 — Fix Business Wizard & Unify Supplier Onboarding

## 1. Exact wizard crash root cause

**Hosted error:** ChunkLoadErrorBoundary → “This page could not be opened.” (non-chunk React render exception)

**Cause:** `BusinessOnboardingWizard` called

```ts
isSupplierBusinessIdentityLocked(profile)
```

but the helper signature is

```ts
isSupplierBusinessIdentityLocked(verificationStatus, verificationSubmittedAt, businessTypeAtLastFetch)
```

Passing the profile object makes `(verificationStatus ?? '').trim()` throw:

`TypeError: (verificationStatus ?? "").trim is not a function`

That exception is caught by `ChunkLoadErrorBoundary` and shown as “This page could not be opened.”

**Fix:** Pass the three status/string fields from the profile. Regression test added in `supplierVerificationLocks.test.ts`.

## 2. Unify onboarding

- Finish setup → Business still opens `/partner/business-setup` wizard.
- Business Settings **Company** tab is now a **read-only summary** (`BusinessProfileSummary`): business info, verification status/docs outstanding, masked payout summary.
- Removed the duplicate editable registered-business form, document upload, and Save & submit controls from Settings.
- Incomplete / rejected → **Continue setup** / **Fix and resubmit** into the correct wizard step (`?step=`).
- Verified → **Request changes** routes to Support (no silent Settings bypass).
- Payout remains separate via **Open payout setup** → `/partner/verification`.

## 3. Safety

LIVE Accounts v2 gate OFF, allowlist empty, payout execution / transfers OFF. No Stripe LIVE mutations.

## 4. Certification plan

- Unit: lock helper + wizard validation
- Production build emits `BusinessOnboardingWizard-*.js`
- After deploy: authenticated browser on hosted `/partner/business-setup` must render steps (not error boundary)
- Admin queue behavior from P9.16 remains (Approve / Request changes / Reject)

## Deploy

Frontend: push to `main` → Vercel partner host. Record deployment ID after release.
