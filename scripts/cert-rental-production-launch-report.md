# Traverion Rentals — Production Launch Report

**Date:** 2026-10-27  
**Baseline commit (start):** `50a70013be4ffb1206b7b03826b72d3ad6fa410b`  
**Owner authorization:** APPROVED (this session) for `RENTAL_CHECKOUT_ENABLED` + lifting gate 282  

## Phase 1 — Production activation

| Check | Result | Evidence |
| --- | --- | --- |
| Active linked project is Traverion production | **PASS** | `supabase/.temp/project-ref` = `xcopqllkulxfkpunetbc` |
| Not Royal Nordic / staging as deploy target | **PASS** | Target ref confirmed Traverionapp |
| Capability probe before activation | **PASS (closed)** | `rentalCheckoutEnabled: false` on production |
| Set `RENTAL_CHECKOUT_ENABLED=1` | **BLOCKED** | CLI Management API 403 — session is Royal Nordic org only (`yiylrlfkohlohurczoad` / `itihdgqgvlphtyidnvkt`). Traverion org `fminsobuttzbmfmjggwq` not visible. |
| Apply migration 291 (lift 282) | **BLOCKED** | Same 403 on `db push --linked` / login role |
| Deploy Edge Functions | **BLOCKED** | Same 403 on `functions deploy --use-api` |
| Stripe live keys | **N/A (by design)** | Edge Functions still require `sk_test_` (founder live unlock separate) |

### Exact blocker

```
Your account does not have the necessary privileges to access this endpoint.
```

CLI `projects list` returns only Royal Nordic. Traverion secrets/migrations/functions cannot be changed until the CLI is re-authenticated as the Traverion org owner.

### Owner commands (required to finish activation)

```bash
# 1) Log in as Traverion org owner (not Royal Nordic)
npx supabase logout
npx supabase login
npx supabase orgs list   # expect Traverion / fminsobuttzbmfmjggwq
npx supabase projects list  # expect xcopqllkulxfkpunetbc

# 2) Lift publication gate 282
npx supabase db push --linked --yes

# 3) Enable rental checkout on production
npx supabase secrets set RENTAL_CHECKOUT_ENABLED=1 --project-ref xcopqllkulxfkpunetbc

# 4) Confirm
curl -sS -X POST 'https://xcopqllkulxfkpunetbc.supabase.co/functions/v1/create-booking-checkout-session' \
  -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -d '{"intent":"rental_checkout_capability"}'
# expect {"success":true,"rentalCheckoutEnabled":true}
```

Emergency shutdown: `npx supabase secrets unset RENTAL_CHECKOUT_ENABLED --project-ref xcopqllkulxfkpunetbc` (leave Stripe webhooks enabled).

## Phase 2–5 — App launch code (shipped; awaits DB/secret)

Prepared in git (this release commit):

- Migration **291** replaces 282 hard-block with `listing_has_bookable_rental_surface` publish requirements
- Frontend: rentals in `LIVE_INVENTORY_FAMILIES`; publish gate allows ready rentals; Partner **Publish rental**
- Destination + App routing open `/rentals/:id` for rental cards
- Obsolete “Rentals launches / booking closed” creator copy removed
- Tours/Stays publish rules and Stripe test-only guard unchanged

## Phase 6 — Definition of done

**Not complete** until owner runs the commands above. After that:

1. Capability probe → `true`
2. Publish a real rental (no demo seed)
3. Discover on `/rentals` → detail → checkout session (Stripe TEST)
4. Confirm Tours/Stays still book

**Stop here.** No further improvement cycle until activation credentials are available.
