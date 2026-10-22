# 12 — System Architecture (as implemented)

---

## High-level

```mermaid
flowchart LR
  subgraph clients [Clients]
    WWW[www traveler SPA]
    PARTNER[partner SPA shell]
    ADMIN[admin SPA shell]
  end
  subgraph vercel [Vercel]
    STATIC[dist static + SPA rewrites]
  end
  subgraph supabase [Supabase]
    AUTH[Auth]
    DB[(Postgres + RLS + RPCs)]
    EDGE[Edge Functions]
    STOR[Storage buckets]
  end
  subgraph external [External]
    STRIPE[Stripe Checkout + Webhooks]
    RESEND[Resend email]
    GHA[GitHub Actions crons]
  end
  WWW --> STATIC
  PARTNER --> STATIC
  ADMIN --> STATIC
  STATIC --> AUTH
  STATIC --> DB
  STATIC --> EDGE
  EDGE --> DB
  EDGE --> STRIPE
  EDGE --> RESEND
  STRIPE --> EDGE
  GHA --> EDGE
  EDGE --> STOR
```

---

## Host & routing

| Host | Shell | Entry |
|------|-------|-------|
| `traverion.com` / `www` | Traveler `App.tsx` | Page keys via `parsePathname` |
| `partner.traverion.com` | `SupplierLayout` | `/partner/*` sections |
| `admin.traverion.com` | `AdminGate` / `AdminShell` | Staff login + tabs |

No React Router — history API + page state in App.

---

## Authoritative booking systems

```mermaid
sequenceDiagram
  participant T as Traveler
  participant SPA as Vite SPA
  participant E as create-booking-checkout-session
  participant S as Stripe
  participant W as stripe-webhook / reconcile
  participant P as promote_paid / authorize RPCs
  participant DB as bookings + ledger

  T->>SPA: Configure option/dates/guests
  SPA->>E: Invoke with selection (not trusted total)
  E->>E: Server quote + inventory checks
  E->>DB: claim/resume pending booking
  E->>S: Checkout Session (60m)
  E-->>SPA: checkoutUrl
  T->>S: Pay / authorize
  S->>W: webhook events
  W->>P: promotePaidFromCheckoutSession
  P->>DB: paid or authorized
  P->>DB: record_paid_booking_earnings (when paid)
```

**Instant Book:** unpaid pending does **not** occupy (mig 257).  
**Stay R2B:** manual capture; authorized occupies; host accept captures; expire job releases.

---

## Availability

| Family | Mechanism |
|--------|-----------|
| Tours | Departure slot capacity; paid+authorized guests; holds rules in booking-hold |
| Stays | Night ranges; blocked nights; occupied by paid+authorized (and R2B authorized) |

Public calendars include holds where SQL says so (historical migrations 079/105 era; Instant pending behavior updated by 257).

---

## Payments & finance

- **MoR:** Platform Stripe Checkout  
- **Promote:** Atomic RPC after amount/currency/listing gates  
- **Orphan/conflict:** Auto refund in promote paths  
- **Guest cancel refund:** Policy + ledger instruction; **manual** Stripe execute  
- **Earnings:** `record_paid_booking_earnings` / reverse / shrink  
- **Payouts:** Admin record (no Connect automation in product)

---

## Notifications

Edge `notify-customer-booking` and `notify-supplier-event` with idempotency keys.  
Reminders via `send-booking-reminders` + GH Actions.  
**Booking row is source of truth; email is best-effort.**

---

## Security boundaries

| Boundary | Enforcement |
|----------|-------------|
| Traveler data | Auth UID + booking ownership RPCs/RLS |
| Supplier data | listing ownership + team roles RLS |
| Admin | JWT role + `public.admin` + edge assertAdmin |
| Webhooks | Stripe signature + event table lock |
| Storage | Bucket policies for listing/verification/logos |

---

## Complexity / duplication notes

| Topic | Observation |
|-------|-------------|
| Cart | Soft-retired multi-item; residual open-checkout page vs Trips |
| Dual promote triggers | Webhook + reconcile (promote short-circuit protects) |
| Commercial freeze | Best-effort on create |
| Large migration history | Iterative honesty > greenfield rewrite |
| Orphan PartnerHelpPage | Dead file |
| Analytics stub | Not productized |

**Recommendation:** Prefer consolidating traveler “open payment” into Trips only; keep promote single helper (already); avoid inventing a second booking engine for stays (already shared).
