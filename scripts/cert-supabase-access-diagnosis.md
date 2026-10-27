# Supabase certification 403 — root cause

**Date:** 2026-10-27  
**Symptom:** `secrets list`, `projects api-keys`, `functions list`, and `db query --linked` return HTTP 403 Access Control errors for Traverion project refs.

## Exact cause

The local Supabase CLI session is authenticated to the **Royal Nordic** organization only:

| Field | Observed |
| --- | --- |
| CLI org | `yiylrlfkohlohurczoad` / Royal Nordic |
| Visible project | `itihdgqgvlphtyidnvkt` (royalnordicfi) |
| Traverion production | `xcopqllkulxfkpunetbc` — not visible → Management API 403 |
| Traverion staging | `gedktutbpfwnstcbffsc` — not visible → Management API 403 |

This is **not** a missing Traverion project secret, revoked service-role key, or RLS failure. Staging application credentials in `.local/rental-cert-staging.env` still work:

- Direct Postgres (`CERT_DATABASE_URL`) → connected as `postgres`
- Staging Auth admin API → create/sign-in/delete users
- Staging capability probe → `rentalCheckoutEnabled: true` (secret already set)

## Owner action required (CLI only)

Re-authenticate the CLI as the Traverion org owner (the account that owns Traverionapp / staging):

```bash
npx supabase logout
npx supabase login
npx supabase orgs list
# Expect Traverion org (historically fminsobuttzbmfmjggwq), not only Royal Nordic

npx supabase projects list
# Expect xcopqllkulxfkpunetbc and gedktutbpfwnstcbffsc

# Optional verification (do not set production flag):
npx supabase secrets list --project-ref gedktutbpfwnstcbffsc | rg RENTAL
npx supabase secrets list --project-ref xcopqllkulxfkpunetbc | rg RENTAL
# Production must show NO RENTAL_CHECKOUT_ENABLED line
```

Do **not** run `secrets set RENTAL_CHECKOUT_ENABLED=1` on production.

## Workaround used by cert scripts

Checkout certification now prefers the public edge capability probe (`intent: rental_checkout_capability`) over Management API `secrets list`, and uses `CERT_*` keys from `.local/rental-cert-staging.env` so hosted staging certs can run without platform admin login.
