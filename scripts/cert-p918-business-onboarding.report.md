# P9.18 — Business onboarding polish & validation

**Verdict: PASS**

## Production deployment

| Item | Value |
|------|--------|
| Primary ship | `7c79233f` · Vercel deployment **7857049595** |
| Follow-up polish | `ebfa3e58` · Vercel deployment **7857202871** (focus first invalid input; phone-conflict copy) |
| DB migration | `20261117150000_p918_business_submission_required_fields.sql` applied to `xcopqllkulxfkpunetbc` |
| Host | https://partner.traverion.com/partner/business-setup |
| Disposable supplier | `p918-biz-mwktmb2y@traverion.invalid` · `be0f0169-26c4-4d74-90b0-69328cb929a8` |

## Safety

LIVE Accounts v2 onboarding, payout execution, and Connect transfers remain **OFF**. Royal Nordic financial / verification history was not modified.

## Browser certification

| Check | Result |
|-------|--------|
| Desktop 1440 — Step 1 layout (~900px, 2-col, blue ?) | PASS |
| Desktop 1440 — Steps 2–4 (contact layout, documents upload/replace, review) | PASS |
| Laptop 1280 — post-submit Finish setup / Under review | PASS |
| Mobile 390 — Finish setup readable, no clipped primary actions | PASS |
| Required-field validation + field errors | PASS |
| Structured directors (add / remove; ≥1 required) | PASS |
| FI Business ID + VAT validation + bounce from contact | PASS (`1234567-1` / `FI12345671`) |
| Document upload + Replace/Remove UI | PASS |
| Save & exit → refresh → resume on Review | PASS |
| Review: Finland label, Edit actions, Submit for review | PASS |
| Submit → status Under review | PASS |
| Admin Verification queue visibility (Approve / Request changes / Reject) | PASS |
| Nested scroll / footer overlap on wizard steps | PASS (no nested scrollbar issues observed) |

## Unit tests

`business-identity-validation`, `business-onboarding-wizard`, `supplierOnboarding` — all green.

## Notes

1. First submit attempt failed with a unique phone collision (`+358401234567` already on another disposable). Retry with `+358409181234` succeeded. Follow-up deploy maps that DB error to a clear partner message.
2. Historical verified suppliers are not re-gated by new VAT/director requirements for publish.
3. Disposable supplier left in `pending` for queue visibility; not auto-approved.

## Next

Business onboarding work stops here. Next mission: **Payout Setup**.
