# TRAVERION PHASE 1862 — ADMIN PAYOUT VERIFICATION GOLDEN PATH

**Date:** 2026-10-04  
**Branch:** `main`  
**Stripe:** TEST only (not exercised)  
**Starting SHA:** `fa98312f1eb3d645bc6b4323cde4107f05d351ba`  
**Ending SHA:** *(recorded after commit)*  
**Working tree:** clean after ending-SHA record  
**Origin:** local `main` ahead of `origin/main` (push not performed)

---

## 1. EXECUTIVE RESULT

Admin **payout** verification is certified end-to-end on localhost `/admin`:

traveler denied → staff login → Pending payout review **2** → reject with banking feedback → approve → queue clear → supplier sees **Payout rejected** + staff note → non-admin edge **403** → decision email idempotency.

**P0 defect found and fixed:** `already_sent` paths for approve/reject business+payout updated the DB *before* skipping email, so a replay could overwrite staff feedback (observed as supplier UI showing `"again"` after cert re-reject). Deployed fix: check `alreadyEmailed` **before** any `supplier_profiles` update.

---

## 2. HYPOTHESIS

Payout approve/reject UI/queue/email/idempotency might be incomplete or dishonest relative to business verification (1858).

**Proven:** path works; idempotent replay was mutating feedback (fixed + redeployed).

---

## 3. SUBJECTS

| Role | Identity |
|------|----------|
| Staff admin | `info.traverion@gmail.com` (password rotated for cert: `Phase1862-Admin-Cert!`) |
| Reject subject | `phase1862.reject+1791127248350@traverion.test` / `2f3d33a1-…` |
| Approve subject | `phase1862.approve+1791127249310@traverion.test` / `2eb62713-…` |
| Non-admin probe | reject subject JWT → list → **403** |

Seeded with `verification_status=verified` + `payout_verification_status=pending` + IBAN/BIC + `payout_verification_submitted_at` so they enter the payout queue filters.

---

## 4. EVIDENCE

| Step | Label |
|------|--------|
| Traveler `mirov…` on `/admin` → Access denied | **BROWSER VERIFIED** |
| Staff → Overview Pending payout review **2** | **BROWSER VERIFIED** |
| Queue Refresh → Phase 1862 Oy rows | **BROWSER VERIFIED** + **API VERIFIED** |
| Reject payout + feedback | **BROWSER VERIFIED** + **DB VERIFIED** |
| Approve payout | **BROWSER VERIFIED** + **DB VERIFIED** |
| Queue clear | **BROWSER VERIFIED** |
| Supplier Settings: Business verified · Payout rejected + IBAN note | **BROWSER VERIFIED** |
| Non-admin list | **API VERIFIED** (403) |
| Re-approve / re-reject email | **API VERIFIED** (`already_sent`) |
| Re-reject no longer overwrites feedback (post-deploy) | **API VERIFIED** + **DB VERIFIED** |
| Decision mailbox body/links | **NOT VERIFIED** |
| `transactional_email_log` rows | **NOT VERIFIED** (edge Resend; markers `payout_*_email_sent_at`) |

DB after browser actions:

- reject: `payout_verification_status=rejected`, feedback = Phase 1862 IBAN note, `payout_rejected_email_sent_at` set  
- approve: `payout_verification_status=verified`, `payout_verified_email_sent_at` set  

Email send marker = **PROVIDER ACCEPTED** (not MAILBOX VERIFIED).

---

## 5. CHANGES

- `supabase/functions/admin-supplier-verification/index.ts` — already_sent before mutate (all 4 decision actions); **deployed** to `xcopqllkulxfkpunetbc`  
- `src/lib/admin-decision-idempotency-1862.test.ts`  
- `TRAVERION-PHASE-1862.md`

---

## 6. SAFETY

- No Stripe LIVE; no RLS weaken; no push.  
- Admin password rotated only for controlled cert login.  
- Idempotent replay no longer clears/overwrites decision state.

---

## 7. WHAT IS NOW CERTIFIED

- Admin payout reject + approve golden path (**BROWSER** / **API** / **DB**).  
- Decision email idempotency without state corruption (**API** / **UNIT** / deployed edge).

---

## 8. WHAT REMAINS UNVERIFIED

1. Real mailbox/content/link verification (admin + booking emails)  
2. Stay checkout auth-resume browser / stay mobile golden  
3. Paid superseded-session live race (architecture/unit already present)  
4. Supplier browser *submit* of payout for these two subjects (seeded; submit UX already covered in supplier Settings flows)

---

## 9. NEXT HIGHEST-VALUE PHASE

**1863 — Real mailbox / content / link verification** if mailbox access is available; otherwise inspect superseded paid-session race evidence and close only if still material.

---

## 10. COMMANDS

```
vitest src/lib/admin-decision-idempotency-1862.test.ts   # 4 pass
supabase functions deploy admin-supplier-verification
# Browser /admin payout reject+approve; partner settings reject honesty
```
