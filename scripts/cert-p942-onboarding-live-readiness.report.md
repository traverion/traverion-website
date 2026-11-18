# P9.42 — Onboarding UX + LIVE activation readiness

| | |
|---|---|
| **Date** | 2026-11-18 |
| **Production** | `xcopqllkulxfkpunetbc` |
| **LIVE create / transfers / payouts this mission** | **Unchanged (all off)** |

---

## Priority 2 — EM Global Oy verification

| Field | Production value |
|---|---|
| Supplier | `eced0f8c-c2e4-469b-8bba-15170be68cc1` |
| Email | `contact@royalnordic.fi` |
| Legal name | EM Global Oy |
| `verification_status` | **`pending`** |
| `verification_submitted_at` | `2026-11-18 18:42:15+00` |
| Feedback | **null** (prior rejection cleared on resubmit) |
| Document | `…/company-registration.pdf` (replaced prior `.png`) |

### Why Documents shows “Under review / In review”

Authoritative SoT is `supplier_profiles.verification_status = pending` with a non-null `verification_submitted_at`. That maps to review state **pending** → supplier chip **In review**.

This is **not** a stale rejection UI bug.

### Prior rejection (still on audit trail)

| When | Decision | Note (abbrev.) |
|---|---|---|
| 2026-11-18 13:14–13:15 | `reject` | YTJ fields match EM Global Oy, but upload was a Royal Nordic **marketing poster**, not a Trade Register extract |

No staff approval has been granted. **Do not approve** until an admin confirms the new PDF is a genuine PRH / Trade Register extract.

### Surfaces

All partner onboarding / dashboard chips use `partnerBusinessReviewState()` against the same profile fields. Pending + empty feedback → **In review** everywhere.

---

## Priority 3 — LIVE Connect (still NO-GO for create)

| Control | Value | Action |
|---|---|---|
| `live_custom_onboarding_enabled` | **0** | Keep 0 |
| `live_custom_onboarding_allowlist` | **0 rows** | Keep empty |
| `live_accounts_v2_pilot_approvals` | **0 rows** | Need after verified |
| `stripe_connect_transfers_enabled` | **0** | Keep 0 |
| `payout_execution_enabled` | **0** | Keep 0 |
| EM Global Connect account | **None** | N/A |

### Why LIVE create remains disabled

Edge `connect-supplier-onboarding` requires **all** of:

1. Traverion `verification_status = verified`
2. LIVE Accounts v2 pilot approval row (`owner_confirmed` + Stripe ack)
3. Allowlist membership
4. `live_custom_onboarding_enabled = 1`

EM Global fails (1) until staff approve genuine evidence; (2)–(4) intentionally unset.

### Controlled activation procedure (authorization required later)

When — and only when — EM Global (or another real supplier) is **verified** with genuine registration evidence and a recorded pilot approval:

```sql
insert into public.live_custom_onboarding_allowlist (supplier_id)
values ('<verified-supplier-uuid>');

update public.commercial_runtime_config
set value_int = 1, updated_at = now()
where key = 'live_custom_onboarding_enabled';
```

Keep transfers / payout execution / auto-prepare at **0** during first KYC window. Rollback by setting the gate to 0 and deleting the allowlist row.

**This mission does not request gate authorization.**

---

## Priority 1 — UX ship summary

- Requirement-based progress (not visit-based)
- Shorter LIVE gate notice, once per embedded payout flow (+ help tip)
- Document path falls back to profile SoT on review (fixes false “Missing”)
- Polished Status / next-step screen
- Shared shell typography / footer spacing
