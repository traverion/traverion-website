# P9.43 — First real supplier verification (EM Global Oy)

| | |
|---|---|
| **Date** | 2026-11-18 |
| **Production** | `xcopqllkulxfkpunetbc` |
| **Supplier** | `eced0f8c-c2e4-469b-8bba-15170be68cc1` |
| **Legal name** | EM Global Oy |
| **Y-tunnus** | `3567289-4` |
| **Verdict** | **Business verified** + LIVE v2 pilot eligibility recorded |
| **LIVE create / allowlist / transfers / payouts** | **Unchanged (all off)** |

---

## 1. Document retrieved and inspected

| Field | Value |
|---|---|
| Storage path | `supplier-verification/eced0f8c-…/company-registration.pdf` |
| Size | 168 386 bytes |
| Type | PDF 1.6 (image-rendered pages + extractable text) |
| Document class | **PRH `Ote kaupparekisteristä`** (Trade Register extract) |
| Extract stamp | Digitally stamped in PRH service **28.04.2026 12:27:03 EEST** |
| Pages | 3 content + PRH electronic seal page |

### Extracted identity (from document body, not filename)

| Field | Document |
|---|---|
| Toiminimi | EM Global Oy |
| Y-tunnus | 3567289-4 |
| Yritysmuoto | Osakeyhtiö |
| Postiosoite | Siljotie 2 D 7, 96100 ROVANIEMI |
| Rekisteröity | 30.09.2025 |
| Hallitus / TJ | Vesterinen Miro Kasperi |
| Source line | `Tietolähde: Patentti- ja rekisterihallitus` |

This is **not** the previously rejected Royal Nordic marketing poster.

---

## 2. Official registry corroboration (YTJ open data)

Source: `https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=3567289-4`

| Check | Profile | Document | YTJ | Result |
|---|---|---|---|---|
| Legal name | EM Global Oy | EM Global Oy | EM Global Oy | **PASS** |
| Y-tunnus | 3567289-4 | 3567289-4 | 3567289-4 | **PASS** |
| Address | Siljotie 2 D7, 96100 Rovaniemi, FI | Siljotie 2 D 7, 96100 ROVANIEMI | Siljotie 2 / entrance D / apt 7, 96100 ROVANIEMI | **PASS** (spacing only) |
| Form | company | Osakeyhtiö | Limited company / Osakeyhtiö | **PASS** |
| Director | Miro Vesterinen | Vesterinen Miro Kasperi | (board/CEO on extract) | **PASS** |
| VAT | FI35672894 | — | consistent with 3567289-4 | **PASS** |

---

## 3. Traverion policy decision

Meets business verification requirements (genuine PRH extract + identity match + complete company profile + submitted for review).

**Action taken:** genuine admin `approve_business` via `admin-supplier-verification` (not a direct SQL status flip).

| Audit | Value |
|---|---|
| Decision | `approve` |
| Before → after | `pending` → `verified` |
| Actor | `b6c7cc90-021c-4b6c-88df-2d6386afe305` (`info.traverion@gmail.com`) |
| Event time | `2026-11-18 20:25:15+00` |
| Decision email | sent (`business_verified_email_sent_at` set) |

Prior rejection events remain on the audit trail (marketing poster, 13:14–13:15).

---

## 4. LIVE pilot eligibility

Assessed after verification with owner + Stripe acknowledgements.

| Check | Result |
|---|---|
| `assess_live_v2_pilot` eligible | **true** (no problems) |
| Owner membership | present (`owner` = same user id) |
| Duplicate legal entity | none |
| Existing Connect account | none |
| `approve_live_v2_pilot` | **recorded** |
| `owner_confirmed` | **true** |
| `stripe_verification_acknowledged` | **true** |
| Financial audit | `live_accounts_v2_pilot_approved` |

Pilot approval records **eligibility only**. It does **not** allowlist or enable LIVE account creation.

---

## 5. Controlled LIVE Connect creation window (prepared, not opened)

Still required before the first real Stripe LIVE Account Link:

```sql
-- ONLY after explicit human authorization for this supplier
insert into public.live_custom_onboarding_allowlist (supplier_id)
values ('eced0f8c-c2e4-469b-8bba-15170be68cc1');

update public.commercial_runtime_config
set value_int = 1, updated_at = now()
where key = 'live_custom_onboarding_enabled';
```

Keep during the first KYC window:

| Control | Required value |
|---|---|
| `stripe_connect_transfers_enabled` | **0** |
| `payout_execution_enabled` | **0** |

Rollback: set `live_custom_onboarding_enabled = 0` and delete the allowlist row.

### Current safety snapshot (post P9.43)

| Control | Value |
|---|---|
| `live_custom_onboarding_enabled` | **0** |
| allowlist rows | **0** |
| `stripe_connect_transfers_enabled` | **0** |
| `payout_execution_enabled` | **0** |

**No LIVE financial gate was changed in this mission.**

---

## 6. Supplier next step

EM Global Oy can continue partner onboarding through payout / Stripe setup UX. Account creation remains blocked until the controlled create window above is explicitly authorized.
