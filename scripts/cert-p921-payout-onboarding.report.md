# P9.21 — Native Payout Onboarding Completion (Stripe TEST)

**Verdict: PARTIAL PASS**

| Ship | Value |
|------|--------|
| Commit | `2dd5e60e` (+ follow-up review-label fix) |
| Vercel deployment | **7858630848** |
| Edge function | `connect-supplier-onboarding` redeployed (production) |
| LIVE create gate | **OFF** (`live_custom_onboarding_enabled=0`) |
| Allowlist | empty |
| Payout / transfer execution | **OFF** |
| Royal Nordic Express | **untouched** |

Production Connect edge runs **Stripe LIVE**. Full Stripe account create/bank token attach against production partner UI is intentionally blocked. UX + draft-first path certified on an isolated supplier; Stripe TEST Accounts v2 field mapping certified via API probe (no Traverion DB writes).

---

## 1. Field mapping

| Field | Source of truth | Wizard | Stripe destination (TEST provision path) |
|-------|-----------------|--------|------------------------------------------|
| Legal company name | `supplier_profiles.company_legal_name` | Read-only summary | `submit_business` / company name |
| Country | `address_country` | Read-only | business / person address country |
| Registration number | `company_registration_number` | Read-only | business registration / tax_id |
| VAT ID | `vat_id` | Read-only | `tax_id` when submitting business |
| Registered address | address_* | Read-only | business + person address |
| Directors | `managing_directors` | Not edited here | Never auto→representative/owners |
| Representative | Wizard draft `rep_*` | Editable | `submit_representative` Person |
| Beneficial owners | Draft `beneficial_owners[]` | Multi-add | `submit_beneficial_owners` Persons (`owner`, not director/rep) |
| Ownership % | Draft numeric 0–100 | Validated; total ≤100 | `relationship.percent_ownership` |
| Identity docs | Ephemeral upload | File → Stripe Files API | `upload_identity_document` (not Traverion storage) |
| TOS | Checkbox | Required | `accept_tos` when account exists |
| Bank | Stripe.js token | Mask after attach | `attach_bank_token` (replace OK) |
| Preferences | Profile | Prefill + validate | `payment_cycle`, `payout_threshold_min` |

Edit business details → `/partner/business-setup` (controlled amendment). Approved/pending submitted records are not silently rewritten from the payout wizard.

---

## 2. Provisioning rules

| Platform environment | Existing Connect account? | Behavior |
|----------------------|---------------------------|----------|
| `test` | no | `ensure_account` + native submits allowed |
| `live` | no | Draft-first; friendly unavailable copy; **no create** |
| either | yes | Submit/replace against existing account only |

---

## 3. Browser certification (isolated supplier)

Supplier: `p921-payout-mwkvnn8d@traverion.invalid` (not Royal Nordic).

| Check | Result |
|-------|--------|
| Read-only business summary (name, FI, reg, VAT, address) | **PASS** |
| Edit business details CTA | **PASS** (present) |
| LIVE create blocked + friendly banner | **PASS** |
| Representative separate from directors | **PASS** |
| Multi beneficial owners + ownership total 40+60=100% | **PASS** |
| Save/resume (“Progress saved”) | **PASS** |
| Agreement acceptance | **PASS** |
| Preferences prefilled (monthly / 50) | **PASS** |
| Review: Not started / not LIVE Verified; 2 owners | **PASS** |
| Desktop layout (six-step rail) | **PASS** |
| Stripe TEST ensure/bank attach on production LIVE edge | **BLOCKED by design** |
| Identity file upload end-to-end on production | **BLOCKED** (needs Connect person id) |
| Mobile viewport sweep | **PARTIAL** (desktop exercised; same responsive shell as prior P9.x) |

---

## 4. Stripe TEST API field-map probe

Created Custom TEST account + representative + 2 owners (40/35/25), then deleted account. No Traverion DB write. Evidence: `scripts/cert-p921-stripe-test-fieldmap.json`.

---

## 5. Remaining blockers

1. Production edge `environment=live` → cannot complete Stripe TEST create/token/bank on partner.traverion.com without enabling LIVE create (forbidden this mission).
2. Identity document upload and bank tokenization require a provisioned Connect account (TEST stack or future LIVE allowlist).
3. Express path for Royal Nordic not re-run this mission (explicitly out of scope / do not modify).

---

## 6. Safety attestation

- No LIVE Accounts v2 create enabled
- Allowlist empty
- No payout/transfer execution
- No Express migration
- No money moved
