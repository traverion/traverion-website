# Fully functional checklist

What’s needed so the platform works end-to-end for both consumers and suppliers.

---

## Must-have (implemented or to do)

### 1. Consumer can see their bookings ✅
- **Done:** Migration 005 (RLS), `fetchMyBookings()`, MyBookings page at `/bookings`, “My bookings” in header user menu (desktop + mobile).

### 2. Run migrations
- **003** – listing status, guest_name, supplier update booking status. *(You ran this.)*
- **004** – `bookings.special_requests`. Run in Supabase SQL Editor if not yet applied.
- **005** – RLS: “Consumers can view own bookings” (select where `guest_email` = auth user email).

### 3. Supplier Settings not empty ✅
- **Done:** Settings shows account email and a short note that payout/notifications can be added later.

### 4. Errors visible to users
- **Gap:** Some Supabase errors may not surface (e.g. missing column, RLS).
- **Need:** Booking submit already sets `error`; ensure fetch errors (listings, bookings) show a short message or retry hint where it matters.

---

## Nice-to-have (later)

- Payout method in Supplier Settings (e.g. bank details or “paid via platform”).
- Email notifications (new booking for supplier, confirmed/cancelled for consumer).
- SEO: per-page titles/meta for tour detail and booking (partially there).
- Loading skeletons on main listing and detail pages.

---

## Order of work (done)

1. ✅ Migration 005 (RLS for consumer bookings).
2. ✅ `fetchMyBookings()` + MyBookings page + nav and route.
3. ✅ Supplier Settings: minimal content.
4. **You:** Run migrations 004 and 005 in Supabase SQL Editor if not yet applied (see below).

---

## Migrations to run (Supabase SQL Editor)

**004 – special requests on bookings** (if not run yet):
```sql
alter table public.bookings add column if not exists special_requests text;
comment on column public.bookings.special_requests is 'Optional message from guest at booking time';
```

**005 – consumers can view own bookings**:
```sql
create policy "Consumers can view own bookings"
  on public.bookings for select
  using (
    auth.jwt() ->> 'email' is not null
    and guest_email = (auth.jwt() ->> 'email')
  );
```
