# Traverion — Admin / Support readiness (minimum intervention map)

**Phase:** 1001 (was 903)  
**Stripe:** TEST only  
**Rule:** Do not build a giant admin suite. List what operators need, what exists, what is deferred.

## Minimum interventions a marketplace operator needs

| Need | Why | Current Traverion surface | Status |
|------|-----|---------------------------|--------|
| Find booking by id / guest email / date | Support ticket resolution | `AdminBookingsPanel` on `admin.traverion.com` | PARTIAL — exists; not browser-re-certified this pass |
| Inspect payment / Stripe TEST ids | Reconcile “I paid” vs DB | Booking detail + payment_status / checkout_session_id fields | PARTIAL — fields exist; no Stripe Dashboard deep-link automation |
| Inspect listing + publish status | Unsafe/spam listing | Partner listings + publish guards (095/101/102); staff can view via admin supplier detail | PARTIAL |
| Inspect supplier identity / verification | Onboarding gate | `AdminSupplierVerificationPanel` + edge `admin-supplier-verification` | STRONG / CODE |
| Record manual payout | Accounting without Connect | `admin_record_supplier_payout` (094) + `AdminFinancePanel` | PARTIAL / MANUAL |
| Inspect traveler messages / inquiries | Support | `AdminInquiriesPanel`, `AdminSupplierPortalMessagesPanel` | PARTIAL |
| Suspend / unpublish listing | Moderation | `AdminListingsModerationPanel` + `admin_force_unpublish_listing` (107) + audit `admin_listing_moderation_events`; supplier portal warning notice | IMPLEMENTED / SQL-TESTED |
| Moderate review | Trust | Reviews ownership guards; no staff delete UI claimed | NOT REQUIRED YET |
| Resolve cancellation / Refund due | Money honesty | Partner “Refund due”; manual Stripe TEST refund docs | HONEST / PARTIAL |
| Find user account | Abuse / account help | Via booking guest email + auth admin outside app | BACKEND / ops |

## Explicitly NOT claimed

- Live Stripe intervention tools  
- Automated chargeback workflows  
- Full CS ticket CRM  
- Staff impersonation of traveler/supplier sessions  

## Next actions (priority)

1. P2 — Browser-cert admin listings moderation + bookings search on admin host with staff demo  
2. P1 — Keep Refund due + MANUAL_REFUND.md as truth until auto-refund FOUNDER decision  
3. P1 — Dedicated traveler session / FOUNDER commission before LIVE  

## Source files

- `src/components/admin/*`  
- `src/lib/adminEdgeFunction.ts`  
- `supabase/functions/admin-supplier-verification`  
- `supabase/migrations/094_admin_record_supplier_payout.sql`  
- `supabase/migrations/107_admin_force_unpublish_listing.sql`  
