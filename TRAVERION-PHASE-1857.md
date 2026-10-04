# TRAVERION PHASE 1857 — SUPPLIER GOLDEN PATH CERTIFICATION

**Date:** 2026-10-04  
**Branch:** `main`  
**Stripe:** TEST only  
**Starting SHA:** `0beb5f7` (post-1856 ending SHA record)  
**Ending SHA:** `87c2239e66f897f3dc63db06591c8fcc8cef9a6a`  
**Origin:** local `main` ahead of `origin/main` (push not performed)

---

## 1. EXECUTIVE RESULT

A genuinely new TEST supplier completed the product chain without manual listing/booking DB surgery:

**signup → onboarding → admin verify → create tour from scratch → publish → calendar → traveler discovery → Stripe TEST pay → paid emails → supplier ops → supplier↔traveler messaging → cross-supplier RLS isolation.**

Two product bugs were fixed so the UI path could complete naturally (partner login gate bounce; create deep-link stripped by per-page viewer role race).

| Component | Label |
|-----------|--------|
| Supplier auth / onboarding / verification | **BROWSER VERIFIED** (+ admin approve via edge API) |
| Create from scratch + draft persistence | **BROWSER VERIFIED** + **DB VERIFIED** |
| Publish validation → public discovery | **BROWSER VERIFIED** + **DB VERIFIED** |
| Calendar closed/open parity | **BROWSER VERIFIED** + **DB VERIFIED** |
| Traveler discovery / pricing / schedule | **BROWSER VERIFIED** |
| Stripe TEST booking #49 | **STRIPE TEST VERIFIED** + **BROWSER VERIFIED** + **DB VERIFIED** |
| Traveler `booking_confirmed_paid` | **PROVIDER ACCEPTED** (not mailbox-inspected) |
| Supplier `new_booking` (new supplier recipient) | **PROVIDER ACCEPTED** |
| Inventory / earnings / Trips / Income | **DB VERIFIED** + **BROWSER VERIFIED** |
| Supplier → traveler messaging + reply thread | **BROWSER VERIFIED** + **DB VERIFIED** + **PROVIDER ACCEPTED** |
| Cross-supplier isolation | **API VERIFIED** (RLS) |
| Role/create-gate regressions | **AUTOMATED TEST VERIFIED** (12 pass) |
| Mailbox body/link inspection | **NOT VERIFIED** |

**Verdict:** Supplier golden path **CLOSED** for TEST. Product grade remains constrained by open non-supplier gaps (admin golden as its own phase, soft-notify honesty, auth-resume browser, mobile, mailbox).

---

## 2. STARTING TRUTH

- HEAD `0beb5f7` — Phase 1856 abandoned checkout + Pay-now resume mix closed.
- Working tree had uncommitted partner-gate / role work accumulated during this phase (not prior seed hacks).
- `contact@royalnordic.fi` remains a pre-seeded operator; **not** used as the onboarding subject.
- Isolated supplier created: `phase1857.supplier+1791067390@traverion.test` / `supplier_profiles.id=ee4f3437-…` / team role `owner`.
- Listing created via UI: `db16f4ee-…` — *Phase 1857 Northern Lights Mini Tour*.
- Stripe remains TEST; no LIVE keys.

Royal Nordic was used only as **adversary Supplier B** for ownership checks.

---

## 3. FIXES SHIPPED THIS PHASE

### 3.1 Partner portal gate soft-fail

Cold PostgREST after password login could return empty portal-access and bounce a real partner to `/login`.

- `partnerPortalGate.ts` — require false streak + min attempts before block; partner-signup metadata must not auto-sign-out on false-negative.
- Wired through partner shell / AuthContext / authNavigation.

### 3.2 Shared supplier role provider

Per-page `useSupplierRole` remounted as `viewer` and stripped `?create=` before owner roster loaded.

- `SupplierRoleContext` with `roleStatus: loading | ready | error`
- Partner shell wraps provider once; create/edit gates wait for `ready`
- Regression: `partner-role-shared-1857.test.ts` (+ gate / nav / 1748 / 1775 updates)

---

## 4. GOLDEN PATH EVIDENCE

### Auth / onboarding

New supplier registered through Partner UI, completed company onboarding, submitted verification (`xification_submitted` → Resend accepted). Admin approve exercised (magic-link admin session + `admin-supplier-verification`). Profile `verification_status=verified`; partner dashboard reachable as **Phase 1857 Arctic Tours Oy**.

### Create / publish / calendar

Wizard created tour with Adult €89 / Child €49, max 8, meeting point (Rovaniemi railway station), schedule from 2026-10-10 20:00, cancellation terms, includes/excludes. Draft survived refresh. Publish via supplier UI → `listings.status=published`. Oct 11 closed via `listing_availability.capacity=0`; Oct 12 left bookable. Traveler city search exposed the listing with matching price/schedule/meeting data.

### Booking #49 (Stripe TEST)

| Field | Value |
|-------|--------|
| id | `694f425c-1747-4acf-b3b9-b3d726d0d97f` |
| booking_number | 49 |
| date / start | 2026-10-12 · 20:00 |
| amount | €89 paid (`pi_3UMemV…`) |
| session | `cs_test_a1fb8gGHACWR6nS8…` |
| guest | `mirov.vesterinen@gmail.com` |
| status / payment | `confirmed` / `paid` |

Confirmation page + Trips show Ref #49. Ledger `booking_earnings` €89 for supplier `ee4f3437-…`. Income UI: Collected €89, Stripe TEST, not paid out.

Emails (idempotent keys, status `sent`, Resend message ids present):

| template | recipient |
|----------|-----------|
| `new_booking` | `phase1857.supplier+1791067390@traverion.test` |
| `booking_confirmed_paid` | `mirov.vesterinen@gmail.com` |

No duplicate logical sends for this booking’s paid templates.

### Messaging

Supplier sent operational message from booking detail → `booking_messages` row (`sender_role=supplier`) → traveler Trips shows Host message → `new_booking_message` **PROVIDER ACCEPTED** to traveler.

Traveler reply → second `booking_messages` row (`traveler`) → coherent thread in UI → `guest_message` **PROVIDER ACCEPTED** to new supplier only (not Royal Nordic).

### Cross-supplier (Royal Nordic JWT)

Against listing A / booking #49:

| Op | Result |
|----|--------|
| read published listing | allowed (public) |
| update listing title | no rows / title unchanged |
| upsert availability | RLS `42501` |
| read private booking | `null` |
| insert booking_messages | RLS `42501` |
| read ledger / messages | empty |

No RLS weaken.

---

## 5. SAFETY / NOTES

- No Stripe LIVE.
- Admin approve used controlled admin path; listing/booking rows were not hand-flipped to published/paid.
- Same-origin partner/traveler sessions conflict in one browser profile — certification switched accounts explicitly; product still assumes separate sessions in real use.
- Closed-date inventory is override-based (`capacity=0`); open dates rely on schedule + booking count vs max participants (no `listing_availability.booked` row for Oct 12 after pay — expected for this model).
- Mailbox HTML/CTA click-through not inspected this phase.

---

## 6. REMAINING HIGHEST-VALUE GAPS (post-1857)

1. **Admin verification golden path** (dedicated certification of admin tooling, not only the approve step used here)
2. Soft-notification failure honesty
3. Checkout auth-resume browser re-verification
4. Mobile golden journey
5. Actual mailbox/content/link verification
6. Paid superseded-session race (only if architecture/unit proof judged insufficient)

Next autonomous phase: **1858 — Admin verification golden path**.

---

## 7. COMMANDS

```
vitest partner-role-shared-1857 + partner-portal-gate-1857 + auth-navigation-soft-1857
     + partnerPortalGate + role-fail-closed-1775 + partner-role-hook-1748   # 12 pass
Stripe TEST Checkout 4242… on cs_test_a1fb8gGH…                             # booking #49
RLS adversary as contact@royalnordic.fi against listing db16f4ee / booking 694f425c
```
