# Traverion — Phase 1051

**Mission:** Marketplace completeness continuum after Phase 1050  
**Branch:** `reconstruction/phase-0-audit`  
**Starting SHA (band):** `893e1c9` (Phase 1050 close)  
**Stripe:** TEST only  
**Remote migrations:** Local=Remote through **123** (no new migration)

---

## Problem

`notify-contact-inquiry` accepted forged body fields (`name` / `email` / `subject` / `message`) with `verify_jwt = false`, so anyone could spam ops@ without a real `contact_inquiries` row. Client also invoked notify with the same fields it had just inserted — dual trust paths.

## Fix

1. **Edge (`notify-contact-inquiry`):** require `inquiryId`; load row with service role; send from DB truth only; HTML-escape body; Reply-To = submitter email.
2. **Idempotency:** `contact_inquiry:{inquiryId}` via `transactional_email_log`.
3. **Cooldown:** same submitter email ≤ 1 ops notify / 15 minutes (`entity_type=contact_email`, `entity_id=lower(email)`). Claim and record keys aligned so cooldown actually fires.
4. **Client (`submitContactInquiry`):** insert → `select id` → invoke `{ inquiryId }` only.
5. **Shared:** `sendResendEmail` accepts optional `replyTo`.

Deployed to `xcopqllkulxfkpunetbc`.

## Certification

| Label | Evidence |
|-------|----------|
| CODE-INSPECTED | Edge re-derive + client bind |
| INTEGRATION | Function redeployed after cooldown entity fix |
| AUTOMATED-TESTED | not added this phase (no Deno unit harness for this fn) |
| BROWSER-TESTED | Traveler home `http://127.0.0.1:5173/` loads (Vite bound to IPv4) |

## Explicitly not done

- Rate-limit on `contact_inquiries` INSERT (RLS still allows public insert — required for forms)
- Dual-mode JWT on booking-tied notify-*
- LIVE Stripe / FOUNDER money decisions

## Next highest autonomous residual

Pick from fresh lifecycle audit + known list (session bleed, notify party auth, tour/stay operational gaps).
