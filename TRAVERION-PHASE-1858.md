# TRAVERION PHASE 1858 — ADMIN VERIFICATION GOLDEN PATH

**Date:** 2026-10-04  
**Branch:** `main`  
**Stripe:** TEST only (not exercised this phase)  
**Starting SHA:** `031ac06` (post-1857 ending SHA record)  
**Ending SHA:** _(set after commit)_  
**Origin:** local `main` ahead of `origin/main` (push not performed)

---

## 1. EXECUTIVE RESULT

Admin supplier **business** verification is certified end-to-end through the real `/admin` UI on localhost:

traveler denied → staff login → queue shows pending submissions → **reject with feedback** → **approve** → queue clears → supplier sees reject honesty → edge forbids non-admin → email send markers + idempotent skip.

| Component | Label |
|-----------|--------|
| Traveler on `/admin` → Access denied | **BROWSER VERIFIED** |
| Staff login (`info.traverion@gmail.com`) → Operations dashboard | **BROWSER VERIFIED** |
| Overview pending business count | **BROWSER VERIFIED** (2 → after actions 0) |
| Queue list / refresh | **BROWSER VERIFIED** + **API VERIFIED** |
| Reject business + feedback persist | **BROWSER VERIFIED** + **DB VERIFIED** |
| Approve business | **BROWSER VERIFIED** + **DB VERIFIED** |
| Rejected supplier UI shows staff note | **BROWSER VERIFIED** |
| Non-admin `admin-supplier-verification` | **API VERIFIED** (403) |
| Approve/reject email idempotency | **API VERIFIED** (`already_sent`) |
| Decision emails in `transactional_email_log` | **NOT VERIFIED** (edge uses Resend directly; only `business_*_email_sent_at`) |
| Mailbox body/link inspection | **NOT VERIFIED** |
| Payout approve/reject UI | **NOT VERIFIED** (queue empty; no payout submissions this phase) |
| Supplier-side *submit* for these two subjects | Seeded pending+`verification_submitted_at` for queue isolation; full browser submit already **BROWSER VERIFIED** in Phase 1857 |

**Verdict:** Admin **business** verification golden path **CLOSED** for TEST. Payout-verification admin actions and mailbox inspection remain open.

---

## 2. SUBJECTS

| Role | Identity |
|------|----------|
| Staff admin | `info.traverion@gmail.com` (`app_metadata.role=admin` + `public.admin` row) |
| Reject subject | `phase1858.reject+1791080134877@traverion.test` / `acb52606-…` |
| Approve subject | `phase1858.approve+1791080135550@traverion.test` / `15633ac2-…` |
| Non-admin probe | reject subject JWT → list/approve → **403** |

Pending rows were created with `verification_status=pending` and non-null `verification_submitted_at` so they enter the real admin queue filters (same predicates as `stats` / `list`).

---

## 3. BROWSER PROOF

1. `mirov.vesterinen@gmail.com` on `http://127.0.0.1:5173/admin` → **Access denied**.
2. Staff Continue → Overview: Pending business review **2**.
3. Supplier verification tab → Refresh → both Phase 1858 Oy rows.
4. Reject `Phase 1858 reject Oy` with note  
   `Phase 1858 TEST reject: company registration document missing — please re-upload a clear PDF.`  
   → row leaves queue; DB `verification_status=rejected`, feedback stored, `business_rejected_email_sent_at` set.
5. Approve `Phase 1858 approve Oy` → queue clear; DB `verification_status=verified`, `business_verified_email_sent_at` set.
6. Past verifications empty — correct (requires **both** business + payout verified).
7. Rejected supplier Settings → **Business rejected** + exact staff note shown; cannot masquerade as verified.

---

## 4. API / EMAIL HONESTY

- Non-admin list: `403 Forbidden: Traverion admin role required`.
- Re-approve / re-reject after first send: `{ email: { skipped: true, reason: "already_sent" } }`.
- Decision mail is **not** written to `transactional_email_log` (empty for these recipients). Proof of send is `business_*_email_sent_at` + edge response on first action. Label: **PROVIDER ACCEPTED** via sent-at marker, not mailbox / not transactional log.

---

## 5. SAFETY

- No Stripe LIVE.
- No RLS weaken.
- Admin password rotated only for controlled cert login (local harness).
- Did not treat incomplete onboarding as verified; reject path keeps supplier in setup with explicit rejection state.

---

## 6. REMAINING HIGHEST-VALUE GAPS

1. Soft-notification failure honesty  
2. Checkout auth-resume browser re-verification  
3. Mobile golden journey  
4. Actual mailbox/content/link verification (incl. admin decision emails)  
5. Admin **payout** verification approve/reject browser path  
6. Paid superseded-session race (only if architecture/unit proof judged insufficient)

Next autonomous phase: **1859 — Soft-notification failure honesty** (or mailbox if founder prioritizes delivery truth).

---

## 7. COMMANDS

```
localhost /admin staff login + Supplier verification reject/approve
admin-supplier-verification list/approve/reject as admin vs supplier JWT
```
