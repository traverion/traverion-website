# P9.15.1 — Supplier / Auth wipe executed

**Executed:** 2026-11-17  
**Project:** production `xcopqllkulxfkpunetbc`  
**Authorization:** Owner request to delete the account fully and delete all accounts except customer profile `mirov.vesterinen@gmail.com`.

## Preserved

| Entity | ID |
|--------|-----|
| Auth user | `ebd3979d-a8be-4dc5-bda9-90ba20111a08` |
| Email | `mirov.vesterinen@gmail.com` |
| `consumer_profiles` | Miro Vesterinen (kept) |

## Deleted Auth users

| Email | ID |
|-------|-----|
| `contact@royalnordic.fi` | `9e42bd3a-e72c-4472-bb7e-e8c3a59e2c18` |
| `info.traverion@gmail.com` | `22217025-f1bc-4e80-93d3-6b9b918a4629` |
| `review-notify-e2e@review-e2e.traverion.invalid` | `b22ce002-e2e0-4000-8000-000000000001` |
| `p0915-live-sup-144187f1@traverion.invalid` | `c2dd731a-3001-4bc2-b8ea-7f7dc1ceae09` |
| `p0915-live-trav-144187f1@traverion.invalid` | `41217c6d-0725-4cf0-a1cd-4201c193c839` |

Also removed orphan `supplier_team_members` row `8832ebb4-…` and Miro’s phantom supplier-owner team row (no `supplier_profiles`).

## Deleted dependent data (scoped to doomed suppliers)

- All `supplier_profiles` (Royal Nordic, EM Global pending, P0.9.15 cert)
- All listings for those suppliers + Miro draft “RENTAL RACE TEST — DELETE” listings
- All bookings for those listings (28), refunds, commercial snapshots, earning items, ledger, financial audit rows, pilot selections, reconciliation events, support requests, commercial terms, team memberships
- 29 orphaned Storage objects under listing-images / supplier-logos / supplier-verification

## Stripe

- Traverion DB mapping to `acct_1UcAxbCOlSVGqrHJ` / legacy `acct_1UcBXT2FvgTkBmd2` removed with the supplier profile.
- **Stripe Express accounts were not closed or deleted in Stripe.** They remain in the Stripe platform dashboard until handled separately.

## Post-wipe counts

| Table | Count |
|-------|------:|
| `auth.users` | 1 |
| `consumer_profiles` | 1 |
| `supplier_profiles` | 0 |
| `listings` | 0 |
| `bookings` | 0 |
| `supplier_earning_items` | 0 |
| `supplier_team_members` | 0 |
| Orphan storage (RN/info/c2dd paths) | 0 |

## Ready for fresh registration

`contact@royalnordic.fi` is free for a new Auth + supplier registration.

**Note:** `info.traverion@gmail.com` was also removed. Re-create that ops/admin Auth user before relying on it again.
