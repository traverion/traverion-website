# Traverion Rentals — Final Release Report

**Date:** 2026-10-27  
**Baseline:** `origin/main` @ `a0804088`  
**Production:** `xcopqllkulxfkpunetbc` (Traverionapp, org `fminsobuttzbmfmjggwq`)  
**Staging:** `gedktutbpfwnstcbffsc` (`traverion-rentals-cert-staging`, same org)  
**Production rental checkout:** **OFF** (capability probe this session: `rentalCheckoutEnabled: false`)  
**Publication gate 282:** not lifted  

---

## Verified passes

| Item | Result | Evidence |
| --- | --- | --- |
| Production project identity | **PASS** | Linked locally as Traverionapp; live URL `https://xcopqllkulxfkpunetbc.supabase.co` |
| Production checkout gate | **PASS (closed)** | `intent: rental_checkout_capability` → `{ success: true, rentalCheckoutEnabled: false }` |
| Staging hosted Checkout Session (prior) | **PASS** | `scripts/cert-rental-checkout-session.report.json` (`ok: true`) |
| Stay auto-refund (staging DB + Stripe TEST) | **PASS** | `scripts/cert-stripe-stay-auto-refund.report.json` — PI `pi_3UVH80C…`, refund `re_3UVH80C…`, idempotent replay |
| Stay/tour isolation units | **PASS** | stay quote/concurrency + booking/checkout inventory concurrency + rental creator logic smoke |
| Creator logic 19-screen registry | **PASS** | `src/lib/rental-creator-smoke.test.ts` (4/4) |
| Authenticated Partner login (staging) | **PASS** | Documented demo `aurora-ops@partner-demo.traverion.invalid` against staging Vite `127.0.0.1:5184` |
| Create rental | **PASS** | `/partner/create` → Rentals → onboarding opened |
| Save draft | **PASS** | Listing `ea1a4945-b4bd-4b8a-bcab-f065f5a06934` created as `draft` |
| Resume draft | **PASS** | `?edit=ea1a4945-…` restored category Fat bike, title, destination |
| Walk all 19 screens | **PASS** | basics×5 → photos → pickup/hours/handover → options → duration → booking-rules → requirements → inclusions → rules → cancellation → deposit → preview → publish |
| Option-specific pricing | **PASS** | Option **Standard**, 4 units, **€45 / day** (`pricePerDayMinor: 4500`) persisted |
| Availability / duration | **PASS** | Daily · min 1 · max 7 · calendar-day counting; Mon–Sat hours |
| Preview | **PASS** | Supplier preview showed title, €45/day, option stock, pickup Koskikatu 1, hours, flexible cancel; **Booking unavailable** / payment closed |
| Publication readiness messaging | **PASS** | Finish screen: all sections Complete; copy states draft stays **unpublished**, travelers cannot book until Rentals launches |
| Finish setup save | **PASS** | Returned to listings; DB `status: draft`, `inventoryFamily: rental` |

---

## Genuine failures (resolved in follow-up)

| Item | Result | Detail |
| --- | --- | --- |
| Photo persistence (3 required) | **FIXED** | Cover+gallery counting; Finish waits on uploads; `creatorComplete` race fixed. See `scripts/cert-rental-two-fixes-report.md`. |
| Listings card option summary | **FIXED** | Card shows **Rental**, €45/day, option + units. Tours/Stays paths unchanged. |

---

## Outstanding blockers (not product launch gates)

| Item | Status | Access needed |
| --- | --- | --- |
| Supabase CLI Management API for Traverion org | **BLOCKED** | Traverion-authorized CLI login (or Traverion `SUPABASE_ACCESS_TOKEN`). Royal Nordic CLI left intact; not required for staging `CERT_*` certs. |
| Live tour last-seat race on production listing | **BLOCKED** | Traverion `--linked` DB **or** production service-role. Isolation concurrency units PASS. |
| Reliability / Resend re-run on production-linked DB | **BLOCKED** | Traverion CLI **or** production `SUPABASE_SERVICE_ROLE_KEY`. Prior reliability PASS retained. |
| Full partner-demo seed on staging | **PARTIAL** | Auth + supplier profile created; seed aborted on publish-gate for demo tours. Rental smoke used auth account only (authorized demo credentials). |

---

## Partner smoke credentials used

Authorized staging Partner demo (documented in `docs/PARTNER_DEMO_COVERAGE.md`):

- Email: `aurora-ops@partner-demo.traverion.invalid`  
- Password: (as documented in that file)  
- Target: staging only (`gedktutbpfwnstcbffsc`), via forced env — not production  

No unauthorized accounts were invented. Production service-role was not used.

---

## Verdict

**Staging Partner rental creator smoke: PASS with two genuine UI/persistence defects** (3rd photo not persisted; list card mislabels rental options).  

**Public production rental checkout: still DISABLED.**  

**Do not enable production rental checkout or lift gate 282 without separate explicit owner approval.**

### Owner approval request

Partner create → save → resume → 19-screen journey → option pricing → availability → preview → finished draft is proven on staging.  

**Please give a separate explicit decision** before:

1. Setting `RENTAL_CHECKOUT_ENABLED=1` on production `xcopqllkulxfkpunetbc`, and/or  
2. Lifting migration **282** publish gate for public rental booking.  

Recommended before activation: fix photo persistence so three uploaded photos survive Finish, and fix the listings card rental option/type labels.
