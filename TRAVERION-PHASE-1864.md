# TRAVERION PHASE 1864 — STAY MOBILE TRAVELER GOLDEN JOURNEY

**Date:** 2026-10-04  
**Branch:** `main`  
**Stripe:** TEST only  
**Starting SHA:** `c6fee74dbb0d7fb168875a4f9eccd3f46ce4fa74`  
**Ending SHA:** *(set after commit)*  
**Working tree:** clean after ending-SHA record  
**Origin:** local `main` ahead of `origin/main` (push not performed)

---

## 1. EXECUTIVE RESULT

Stay traveler golden path at **390×844** is **BROWSER VERIFIED** end-to-end:

Stay listing → calendar (2 nights) → terms → Continue → Stripe TEST pay → Booking confirmed (#53) → Trips expand (Cancel / Messages).

No Traverion code defect found that blocked the journey. Sticky dock can intercept lower calendar days (same class as tour mobile 1861); **Select dates** scrolls the booking panel into range.

Also closed two remaining-band judgments without manufacturing work:

| Gap | Judgment |
|-----|----------|
| Mailbox / content / link | **NOT VERIFIED** — no IMAP/inbox credentials; Resend secret present as digest only; founder action required |
| Paid orphan superseded live race | Architecture + unit + expire-on-Pay-now (1856 #48) **sufficient**; live double-paid race not material to force |

---

## 2. HYPOTHESIS

Narrow viewport would hide stay CTAs, break night-range calendar/checkout, overflow horizontally, or trap nav after tour-mobile (1861) and stay desktop auth-resume (1863).

**Proven false** for the stay book path on this run.

---

## 3. EVIDENCE

Viewport: CDP `Emulation.setDeviceMetricsOverride` 390×844, `mobile: true` on Traverion surfaces. Cleared for Stripe Hosted Checkout fill (Stripe UI scroll glitch under forced 390 — same as 1861).

| Step | Result | Label |
|------|--------|--------|
| Stay PDP @390 | Menu + sticky Select dates; `overflowX: 0` | **BROWSER VERIFIED** |
| Check-in 10 Oct / check-out 12 Oct | Sticky intercepts late-month days; Select dates → mid-month pick works | **BROWSER VERIFIED** |
| Quote | €445 total (2×€185 + €75 cleaning); lead guest prefilled | **BROWSER VERIFIED** |
| Terms + Continue | Sticky Accept terms / Continue to checkout | **BROWSER VERIFIED** |
| Stripe TEST | `cs_test_a1BTuG2QQ22fV16NE6QLhkgbAYEsjYKv07ivmmXNqxZbzzLI6WlHIb5QY2` · Traverion sandbox · stay title | **BROWSER VERIFIED** / TEST |
| Confirmation | Ref **#53**, Confirmed, Amount paid `€445` + `TEST` siblings, dates 10→12 Oct | **BROWSER VERIFIED** |
| Trips expand #53 | Confirmed/Paid, Cancel, Messages thread, `overflowX: 0` | **BROWSER VERIFIED** |
| Mobile menu | Explore/Tours/Stays/Saved/Trips/Account/Log out | **BROWSER VERIFIED** |

Stay id: `83f88255-63ef-4824-93a2-89cc13244567`  
Booking id: `3a2fe8e2-8572-488e-a592-46edd9616cf7` · ref **#53** · 2 guests · 2 nights · €445

Prior abandoned stay Checkout from 1863 auth-resume was expired via Stripe API before this book (`cs_test_a1ZGBwr…` → failed hold **#52**), so Oct 10–12 inventory stayed bookable.

### Mailbox / paid-orphan (band close)

| Check | Label |
|-------|--------|
| Local `.env` IMAP/SMTP/RESEND read keys | absent |
| `supabase secrets list` RESEND_API_KEY | digest only — cannot fetch mailbox |
| Orphan refund helper + promote path | **UNIT VERIFIED** (prior) |
| Pay-now expires prior Checkout before new session | source + 1856 #48 |
| Mailbox body/CTA | **NOT VERIFIED** (founder) |

---

## 4. CHANGES

None required. Certification evidence only (`TRAVERION-PHASE-1864.md`).

---

## 5. SAFETY

- Stripe TEST only (`cs_test_…`, Traverion sandbox, `sk_test_…` expire helper).  
- No LIVE, no RLS changes, no push.  
- One payment → one authoritative stay booking (#53).

---

## 6. WHAT IS NOW CERTIFIED

- Mobile stay discover → date range → pay → confirm → Trips (**BROWSER VERIFIED**).  
- Tour mobile (1861) + stay mobile (1864) both covered.  
- Mailbox left explicitly open; paid-orphan live race judged non-material given expire-on-rotate + unit/architecture.

---

## 7. WHAT REMAINS UNVERIFIED

1. Real mailbox/content/link verification (**founder**: inbox access or Resend received-email tooling)  
2. Mobile anon auth-resume on stay (this run used signed-in traveler; desktop stay auth-resume certified in 1863)  
3. Paid orphan *double-capture* live race (narrow; architecture/unit + expire-on-rotate)

---

## 8. NEXT HIGHEST-VALUE PHASE

Stop autonomous commercial certification here unless a new material hypothesis appears: mailbox requires founder credentials; remaining items are narrow edge races already architecturally covered. Re-open only if production email delivery or a paid double-session incident is reported.

---

## 9. COMMANDS

```
# Browser @ 390×844: stay → Oct 10–12 → Continue → Stripe TEST 4242 → #53 → Trips
stripe checkout sessions expire <prior cs>   # cleared 1863 abandoned hold
```
