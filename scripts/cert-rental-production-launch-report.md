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
| Set `RENTAL_CHECKOUT_ENABLED=1` | **PASS** | Secret set on `xcopqllkulxfkpunetbc` after Traverion CLI login |
| Apply migration 291 (lift 282) | **PASS** | `db push --linked --include-all` applied `20261026195434`, `20261026221753`, `291` |
| Capability probe after activation | **PASS** | `{"success":true,"rentalCheckoutEnabled":true}` |
| Stripe live keys | **N/A (by design)** | Edge Functions still require `sk_test_` (founder live unlock separate) |

### Applied on production

- Migrations: `282` (history), `290`, `291`, plus claim-window + webhook RLS guards  
- Publish function comment: *tour, stay, and rental* (multi-unit stays still drafts)  
- Secret: `RENTAL_CHECKOUT_ENABLED` present  

Emergency shutdown: `npx supabase secrets unset RENTAL_CHECKOUT_ENABLED --project-ref xcopqllkulxfkpunetbc` (leave Stripe webhooks enabled).

## Phase 2–5 — App launch code (shipped on `ed0b0cd7`)

- Migration **291** replaces 282 hard-block with `listing_has_bookable_rental_surface` publish requirements
- Frontend: rentals in `LIVE_INVENTORY_FAMILIES`; publish gate allows ready rentals; Partner **Publish rental**
- Destination + App routing open `/rentals/:id` for rental cards
- Obsolete “Rentals launches / booking closed” creator copy removed
- Tours/Stays publish rules and Stripe test-only guard unchanged

## Phase 6 — Definition of done

**Production gates are ON.** Owner personal smoke next:

1. Capability probe → `true` ✅  
2. Publish a real rental (no demo seed)  
3. Discover on `/rentals` → detail → checkout session (Stripe TEST)  
4. Confirm Tours/Stays still book  

**Stop here for owner live testing.**
