# P9.16.1 — Fix Business Wizard & Unify Supplier Onboarding

**Verdict: PASS** (hosted wizard loads; Settings is read-only summary; duplicate editable form removed)

## 1. Exact wizard crash root cause

**Hosted error:** `ChunkLoadErrorBoundary` → “This page could not be opened.” (non-chunk React render exception)

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

**Fix:** Pass the three status/string fields from the profile. Regression test in `supplierVerificationLocks.test.ts`.

## 2. Implementation commit

- Primary fix + Settings summary: `ddb96a77` — *Fix business-setup wizard crash and convert Settings to a summary.*
- Cert + rejected → documents step: `c76c8ae1` — *Certify P9.16.1 wizard fix and route corrections to documents.*

## 3. Production frontend deployment

| Item | Value |
| --- | --- |
| Host | `https://partner.traverion.com` |
| Deployment ID (wizard fix live) | `7852595115` (`ddb96a7`) |
| Deployment ID (cert follow-up) | `7852832354` (`c76c8ae`) |
| Environment | Production |

## 4. Unify onboarding / navigation

- **Finish setup → Business** opens `/partner/business-setup` wizard.
- **Business Settings → Company** is read-only `BusinessProfileSummary` (info, verification, masked payouts).
- Removed duplicate editable registered-business form, document upload, and **Save & submit** from Settings.
- Incomplete → **Continue setup**; rejected → **Fix and resubmit** (`?step=` into wizard).
- Pending → **Under review**; verified → **Verified** (business only); payout stays separate via **Open payout setup**.
- Draft listings allowed while waiting.

## 5. Admin queue

Authenticated admin `request_changes_business` on disposable supplier:

- Single `supplier_profiles` row (no duplicate profile / Stripe account).
- Review events: `submitted` → `request_changes` → `submitted` (correction updates same workflow).
- Queue shows supplier brand + legal name + pending status + submitted timestamp.
- Approve / Request changes / Reject path preserved via `admin-supplier-verification`.

## 6. Production safety (readback)

| Flag | Value |
| --- | --- |
| `live_custom_onboarding_enabled` | `0` |
| `payout_execution_enabled` | `0` |
| `stripe_connect_transfers_enabled` | `0` |

No LIVE Stripe create / disconnect / migrate. Accounts v2 LIVE gate remains OFF; allowlist empty.

## 7. Browser certification (production)

Disposable supplier: `p9161-b7c64f@traverion.invalid` / user `718ae3a5-ac82-4289-834e-a0ae960e3089`

| Check | Result |
| --- | --- |
| Hosted `/partner/business-setup` opens (no error boundary) | **PASS** |
| All 4 wizard steps render | **PASS** |
| Required-field validation | **PASS** (“Enter a contact phone number.”) |
| Save & exit + resume | **PASS** (step 2 values restored) |
| Document upload | **PASS** (`company-registration.pdf` on file) |
| Submit reaches admin queue / review events | **PASS** |
| Business Settings read-only summary of submitted data | **PASS** |
| Old editable onboarding / Save & submit gone from Settings | **PASS** |
| Admin request changes → supplier Fix and resubmit | **PASS** |
| Correction resubmit (same profile, no duplicate row) | **PASS** |
| Finish setup → Business opens wizard | **PASS** |
| Desktop layout | **PASS** |
| Mobile (~390×844) layout | **PASS** |
| Existing approved suppliers not forced through setup | **PASS** (no approved supplier profiles post-wipe; mirov has no supplier row) |
| Accounts v2 payout onboarding Stripe TEST | **N/A** (separate; LIVE gate OFF) |

## 8. PASS/FAIL matrix (deliverables)

| Deliverable | Status |
| --- | --- |
| Exact wizard crash root cause | **PASS** |
| Implementation commit | **PASS** (`ddb96a77` + follow-up) |
| Production frontend deployment ID | **PASS** (`7852595115` / `7852832354`) |
| Updated onboarding navigation | **PASS** |
| Business Settings read-only summary | **PASS** |
| Admin queue certification | **PASS** |
| Desktop/mobile authenticated browser results | **PASS** |
| Hosted wizard works + duplicate form removed | **PASS** |
