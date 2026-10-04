# TRAVERION — FOUNDER LAUNCH READINESS REPORT

**Date:** 2026-10-05  
**Branch:** `main`  
**Stripe:** TEST only (LIVE blocked in code)  
**Audit mode:** AUDIT → FIX → VERIFY → REPORT  
**Scope:** Entire product readiness before Supplier #1 / real money

---

## 1. EXECUTIVE VERDICT

**READY FOR FIRST SUPPLIER WITH OWNER ACTIONS**

**Not** ready for real-money pilot until Miro completes Resend delivery proof, decides take-rate + payout architecture, and keeps Stripe in TEST for the first supplier demo.

**Why this verdict**

- Traveler book path (tour + stay), auth-resume, mobile @390, supplier golden path, admin business + payout verification, soft-notify honesty, and inventory/payment race architecture are **already certified** through Phases 1857–1864 on Stripe TEST.
- Partner copy is largely honest: verification gates publish; payouts are manual; email is not treated as booking proof.
- Money model is **platform Checkout merchant-of-record at 0% commission** today — suppliers are ledgered **100% of `amount_paid`**. That is fine to *show* Supplier #1 only if Miro states it clearly; it is **not** a finished commercial model for LIVE.
- Transactional email is wired with idempotency and soft-failure honesty, but **mailbox delivery is still NOT EXTERNALLY VERIFIED** (founder Resend/domain action).
- This audit added a real marketplace trust gap: **review reporting + staff hide/resolve queue** (migration 237, deployed admin edge).

---

## 2. STARTING SHA

`28076b39953e78adcfe01f874890cfb3af48166b` (post Phase 1864)

## 3. ENDING SHA

*(set after commit)*

## 4. COMMITS CREATED

See git log after this report commit (content reports + this report).

## 5. WORKING TREE STATE

Clean after commit.

## 6. PUSH STATE

Local `main` ahead of `origin/main` — **not pushed** (per policy).

---

## 7. TRAVELER GOLDEN PATH

| Surface | Result | Notes |
|---------|--------|-------|
| Discovery | **PASS** | Home / tours / stays search; published-only |
| Product | **PASS** | Tour + stay PDPs with price, host, cancellation |
| Availability | **PASS** | Calendar + capacity; holds for unpaid checkout |
| Booking | **PASS** | Options / guests / terms / sticky CTA |
| Auth | **PASS** | Modal mid-checkout; role routing |
| Checkout | **PASS** | Auth-resume tour+stay browser-certified |
| Payment | **PASS (TEST)** | Stripe Checkout platform; LIVE blocked |
| Confirmation | **PASS** | Trips is source of truth; TEST badge honest |
| Trips | **PASS** | Expand, cancel, messages, Pay now |
| Messaging | **PASS** | Party + paid only; RLS/RPC |
| Cancellation | **PASS** | Policy states; Refund due ≠ auto Stripe refund |
| Review | **PASS / PARTIAL** | Paid + experience-started; report added; no edit UI |

---

## 8. SUPPLIER GOLDEN PATH

| Surface | Result | Notes |
|---------|--------|-------|
| Registration | **PASS** | Partner signup + welcome path |
| Verification | **PASS** | Business + payout queues; admin approve/reject certified |
| Listing creation | **PASS** | Wizard; draft anytime |
| Options / pricing | **PASS** | Tour options + stay nights |
| Availability | **PASS** | Schedules / stay calendar |
| Publishing | **PASS** | Needs both verifications |
| Bookings | **PASS** | Ops + messages |
| Messages | **PASS** | Booking-linked |
| Cancellations | **PASS** | Host request / policy paths |
| Earnings | **PASS (accounting)** | Available = collected − recorded payouts; **0% fee** |
| Payouts | **PARTIAL** | Manual admin record only; no Connect / auto transfer |
| Performance | **PARTIAL** | Basic stats; not a BI product |

---

## 9. ADMIN GOLDEN PATH

| Surface | Result |
|---------|--------|
| Supplier verification | **PASS** (business + payout browser/API/DB) |
| Review moderation | **PASS (new)** — Reports tab + hide review |
| Reports | **PASS (new)** — `content_reports` queue |
| Bookings | **PASS** — admin bookings panel |
| Payments / finance | **PASS (visibility)** — finance summary; TEST |
| Refund visibility | **PARTIAL** — status Refund due; Stripe refund manual |
| Payout visibility | **PASS** — record payout + earnings |
| User problems | **PARTIAL** — contact inquiries; no full CRM |

---

## 10. MONEY MODEL — CURRENT TRUTH

**Plain English (code today)**

| Question | Answer |
|----------|--------|
| Traveler pays | Traverion’s **Stripe platform** Checkout (`mode: payment`) |
| Traverion receives | Full charge on platform Stripe balance |
| Supplier earns | Internal ledger `booking_earnings` = **100% of `amount_paid`** |
| Traverion earns | **€0 commission** (no take-rate implemented) |
| Stripe receives | Processing fees on the **platform** account (not modeled in app) |
| Commission calculation | **None** — schema has unused `platform_commission` kind |
| Commission storage | **Not stored** on booking |
| Refund behavior | Cancel → often **Refund due** (earnings reversed); **no automatic Stripe refund**. Stripe `charge.refunded` / partial shrink handled by webhook |
| Payout behavior | **Manual** `admin_record_supplier_payout` only |
| Payout timing | **No automated schedule** (`payment_cycle` / threshold are preferences) |
| Who holds funds | **Traverion (platform Stripe)** until human payout |
| What is TEST-only | All Checkout / webhook secrets must be `sk_test_` / `cs_test_` |

### Concrete example — Traveler booking = €1,000

1. Checkout creates €1,000 line → charge on **platform TEST** account.  
2. Webhook promotes booking → `amount_paid = 1000`, `payment_status = paid`.  
3. `record_paid_booking_earnings` → supplier ledger **+€1,000**.  
4. Partner Money “Available” ≈ €1,000 − any recorded paid-out periods.  
5. Platform commission in code: **€0**.  
6. Free-cancel Refund due → ledger −€1,000; cash still in Stripe until **manual** refund.  
7. No automatic bank transfer to supplier.

---

## 11. COMMISSION DECISIONS FOR MIRO

**Current implementation:** effective **0%**. Gross earnings only. Honest UI does not invent a take-rate.

Miro must decide before LIVE (do **not** invent in code without him):

- [ ] Default platform commission % (e.g. considering ~10% vs incumbents)
- [ ] Supplier-specific negotiated rate allowed?
- [ ] Promotional / temporary rate allowed?
- [ ] Snapshot at payment time (immutable on booking) — **required** if any fee exists
- [ ] Who absorbs Stripe processing fees?
- [ ] Commission treatment on full / partial refund?
- [ ] VAT/tax presentation — confirm with accountant/lawyer

---

## 12. PAYOUT DECISIONS FOR MIRO

**Current technical behavior:** bank details collected + verified; “Available” is an **accounting claim**; staff record payouts after money is actually sent. No Stripe Connect transfers.

Unresolved (relevant):

- [ ] Keep platform + manual payouts vs Stripe Connect
- [ ] Payout frequency (weekly / monthly / after activity)
- [ ] Payout delay / post-activity hold
- [ ] Refund reserve
- [ ] Minimum payout (prefs exist; not enforced)
- [ ] Failed payout handling / supplier communication
- [ ] Auto-refund on eligible cancel vs keep Refund due + Dashboard refund

---

## 13. EMAIL / RESEND STATE

| Layer | State |
|-------|-------|
| Code paths | Broad traveler + supplier + admin decision + reminders |
| Idempotency | `transactional_email_log` + column stamps |
| Soft-failure honesty | Phase 1859 — DB success ≠ email success |
| Provider acceptance | Historically intermittent; **do not claim mailbox** |
| Mailbox / body / links | **NOT EXTERNALLY VERIFIED** |

### RESEND — Miro actions

- [ ] Verify `traverion.com` (or chosen) domain in Resend (SPF/DKIM)
- [ ] Set production sender(s): `SUPPLIER_EMAIL_FROM`, `CUSTOMER_BOOKING_EMAIL_FROM`
- [ ] Replace/confirm valid `RESEND_API_KEY` in Supabase Edge secrets
- [ ] Set `CONTACT_INQUIRY_TO`, `STAFF_VERIFICATION_EMAIL`
- [ ] Send one traveler booking email + one supplier new-booking email
- [ ] Inspect **actual inbox**: sender, subject, body, CTA URL (no localhost), role correctness
- [ ] Confirm Auth emails (Supabase SMTP) separately from Resend

---

## 14. STRIPE STATE

| Item | State |
|------|-------|
| Mode | **TEST only** — LIVE secrets rejected in edge code |
| Collection | Platform Checkout (not Connect) |
| Webhooks | `stripe-webhook` + reconcile paths; idempotent event processing |
| UI | Sandbox / TEST labels / `Pay now · test mode` |

### Before LIVE (Miro — do not auto-activate)

- [ ] Decide Connect vs platform merchant model
- [ ] Create LIVE webhook endpoint + secrets
- [ ] Replace publishable/secret keys in hosting + Supabase secrets
- [ ] Remove or gate TEST chrome for production travelers
- [ ] Run one LIVE €1 smoke with refund plan

---

## 15. EXTERNAL SERVICES

| Service | Current state | Code expects | Miro must do | Verify |
|---------|---------------|--------------|--------------|--------|
| Supabase | Linked project live | URL + anon + service role on edges | Keep backups / prod project hygiene | Auth + RLS smoke |
| Stripe | TEST | `sk_test_` / webhook secret | LIVE decision later | Checkout + webhook logs |
| Resend | Secret present; delivery unproven | `RESEND_API_KEY` + verified from | Domain + key + inbox proof | Real mailbox |
| DNS / domain | Production site assumed | `PUBLIC_SITE_URL` for email links | Ensure prod URL on edges | Email CTAs → prod |
| Storage | listing-images + verification docs | RLS path ownership | None urgent | Upload/publish |
| Cron reminders | `send-booking-reminders` | Cron secret | Confirm schedule enabled | Reminder log row |
| Analytics | Light / optional | Consent surfaces | Decide tool | N/A |
| Maps | If configured in env | Client key | Confirm billing | Listing map |
| GitHub / hosting | Ahead locally | Deploy from main | Push/deploy when ready | Live smoke |

---

## 16. SECURITY VERDICT

| Area | Verdict |
|------|---------|
| Authentication | Solid traveler / supplier / admin separation |
| Authorization / RLS | Strong on bookings, messages, reviews, earnings |
| IDOR | Party RPCs + ownership guards; do not weaken |
| Payment trust | Server/webhook authoritative; client success not trusted |
| Admin | Panel allowlist + `app_metadata.role=admin` |
| Supplier isolation | Cross-supplier guards certified in prior phases |
| Traveler isolation | Booking ownership hardened |
| Documents / storage | Path-prefixed ownership |
| Secrets | Not exposed in client; do not print |

---

## 17. MOBILE VERDICT

| Role | Verdict |
|------|---------|
| Traveler | **PASS** — tour mobile (1861) + stay mobile (1864) @390×844 |
| Supplier | **PARTIAL** — usable; dense ops better on desktop |
| Admin | Desktop-first; acceptable for staff |

Remaining: sticky dock can intercept late calendar days (Select dates recovers); Stripe Hosted Checkout under forced 390 is Stripe UI, not Traverion.

---

## 18. PROFESSIONAL UX VERDICT

| Dimension | Evidence |
|-----------|----------|
| Visual hierarchy | Brand-led home (“TRAVERION” + one headline); calm Finland palette |
| Simplicity | Booking sticky: date → guests → terms → Continue |
| Premium feel | Display typography, soft sheets, restrained cards |
| Trust | Verification gates, Trips-as-confirmation, TEST honesty, no fake take-rate |
| Forms | Lead guest + terms near CTA; validation present |
| Motion | `motion-safe` slide-up / fade — not blocking |
| Content separation | PDP sections: place / amenities / availability / host / reviews |
| Consistency | Shared copy constants for partner money/verification |
| Mobile polish | Certified book paths; overflowX 0 on checked screens |
| Error quality | Soft-notify + NoticeCallouts; avoid inventing delivery |

Not “template purple SaaS.” Still a TEST marketplace — TEST chrome must stay until LIVE.

---

## 19. MICRO-DETAIL FINDINGS

| Finding | Action |
|---------|--------|
| No review report button | **FIXED** — Report in reviews modal → `submit_content_report` |
| No staff review hide | **FIXED** — `hidden_at` + Admin Reports → Hide |
| No admin report queue | **FIXED** — Admin → Reports tab |
| Commission UI inventing % | Already honest (0% / no fake fee) — keep until Miro decides |
| Payout prefs look like schedules | Copy already says preference / manual — OK |
| Refund due ≠ Stripe refund | Documented; founder decides auto-refund |
| Mailbox never inspected | Remains **NOT EXTERNALLY VERIFIED** |
| One review per booking_id | Still unique per listing+user — acceptable for v1 |
| Review edit/delete UI | Deferred — RLS allows; no traveler UI |
| Message / listing traveler report | Schema allows types; UI only for reviews now |
| `€89TEST` confirm glue | Fixed in 1861 |
| Soft-notify lying about ops | Fixed in 1859 |

---

## 20. REAL-MONEY BLOCKERS

### P0

1. Resend domain + valid key + **mailbox** proof of traveler + supplier emails  
2. Commission / take-rate decision + immutable snapshot design before LIVE  
3. Payout architecture decision (Connect vs manual) + clear supplier contract language  
4. Explicit LIVE Stripe cutover checklist (do not flip accidentally)  
5. Auto-refund vs Refund-due ops capacity if volume rises  

### P1

1. Review report email-to-ops (queue exists; inbox notify optional)  
2. Message/listing report UI (schema ready)  
3. Production host auth separation (traveler vs partner) for shared localhost is cert hygiene only  

---

## 21. FIRST-SUPPLIER BLOCKERS

**None that block a serious call + TEST onboarding**, if Miro is honest that:

- Payments are TEST until LIVE  
- Traverion currently takes **0%** in software until he sets a rate  
- Payouts are **manual** after verification  
- Email delivery must be proven before promising notifications  

Embarrassment risks if he oversells Connect, automatic weekly payouts, or “we take 10%” while code still posts 100% earnings.

---

## 22. OWNER ACTIONS — MIRO

### MIRO — DO THESE NEXT

**1. RESEND**
- [ ] Verify sending domain in Resend  
- [ ] Set `RESEND_API_KEY` + from-addresses in Supabase secrets  
- [ ] Inbox-prove traveler confirmation + supplier new booking  

**2. STRIPE**
- [ ] Keep TEST for Supplier #1 demo  
- [ ] Decide Connect vs platform before LIVE  
- [ ] Do **not** enable LIVE until commission + payout policy exist  

**3. COMMISSION**
- [ ] Choose default take-rate (or explicitly stay 0% for pilot)  
- [ ] Decide snapshot rules + Stripe fee absorption  
- [ ] Ask Cursor to implement **only after** written decision  

**4. PAYOUTS**
- [ ] Decide frequency / hold / minimum  
- [ ] Write one paragraph suppliers can understand: when money arrives  
- [ ] Keep manual until Connect (or commit to Connect build)  

**5. LEGAL / ACCOUNTING**
- [ ] Confirm marketplace operator identity, Terms, Privacy, cancellation language with counsel  
- [ ] Confirm VAT/tax treatment with accountant  

**6. FIRST SUPPLIER CALL**
- [ ] Use script in §23  
- [ ] Show partner onboarding → verification → listing → TEST book  
- [ ] Do not promise LIVE payouts or mailbox-proven email until checked  

**7. DEPLOY**
- [ ] Push/deploy when ready (local main ahead; not pushed by this audit)  
- [ ] Confirm migration **237** on production project (applied on linked `xcopqllkulxfkpunetbc`)  

---

## 23. FIRST SUPPLIER TEST SCRIPT

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open partner signup / invite Supplier #1 | Account created; supplier role |
| 2 | Complete business + payout details | Status pending in Settings |
| 3 | Admin approve business + payout | Supplier sees verified; publish unlocked |
| 4 | Create tour (photos, price, option, schedule) | Draft saves |
| 5 | Publish | Listing on `/tours` or stays discovery |
| 6 | Incognito traveler finds listing | Correct title/price/availability |
| 7 | Book Stripe TEST `4242…` | `cs_test_…` → Booking confirmed |
| 8 | Traveler Trips | Confirmed / Paid / messages |
| 9 | Supplier Bookings | New booking visible; message works |
| 10 | Emails | **Only if Resend proven** — else mark NOT EXTERNALLY VERIFIED |
| 11 | Money | Partner Available ≈ gross paid; **no platform fee row** unless you set one |
| 12 | Cancel / refund path | Status honest; Refund due if policy says so; Stripe refund manual unless decided |
| 13 | After experience date | Traveler can review; supplier can reply |
| 14 | Report review | Report → Admin → Reports → Hide / resolve |
| 15 | Payout state | Still manual until you record a payout |

---

## 24. FINAL QUESTION

**Would I personally be comfortable calling the first external supplier tomorrow and showing them this product?**

**YES** — for a serious **TEST-mode** demo and onboarding, with clear verbal caveats on commission (currently 0% in software), manual payouts, and email delivery pending Resend proof.

**Before the call, Miro should complete:**

1. Resend domain + one inbox proof (or explicitly say “notifications are being finalized”).  
2. One-sentence commercial pitch that matches code: platform Checkout, manual payouts, take-rate TBD / currently 0% in system.  
3. Admin login ready to approve their verification the same day.

**NO** for promising LIVE charges, automatic bank payouts, or a locked 10% commission until those are decided and implemented.

---

## APPENDIX A — FIXES THIS AUDIT

| Change | Purpose |
|--------|---------|
| `237_content_reports_and_review_hide.sql` | Reports table + RPC; `reviews.hidden_at`; public SELECT hides staff-hidden |
| `submitReviewContentReport` + Reviews modal Report UI | Traveler can flag spam/fake/abusive reviews |
| Admin Reports tab + `content_reports_list` / `hide_review` / `resolve_content_report` | Staff can action reports |
| `content-reports-1865.test.ts` | Regression coverage |
| Deployed `admin-supplier-verification` + applied migration on linked project | Live TEST project ready for queue |

## APPENDIX B — CERTIFIED PRIOR BAND (do not re-prove)

1857 supplier golden · 1858 admin business verify · 1859 soft-notify · 1860 tour auth-resume · 1861 mobile tour · 1862 admin payout verify · 1863 stay auth-resume · 1864 stay mobile.
