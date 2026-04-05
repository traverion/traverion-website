-- Supplier-side features: business profile, cancellation reason/refund, acknowledgement, review replies, pickup, invoices
-- Run after 011

-- -----------------------------------------------------------------------------
-- 1. Supplier profiles: business, verification, tax, insurance, payment cycle
-- -----------------------------------------------------------------------------
alter table public.supplier_profiles
  add column if not exists business_type text check (business_type in ('company', 'individual') or business_type is null),
  add column if not exists company_legal_name text,
  add column if not exists company_registration_number text,
  add column if not exists managing_directors text,
  add column if not exists business_address text,
  add column if not exists tax_id text,
  add column if not exists vat_id text,
  add column if not exists verification_status text default 'pending' check (verification_status in ('pending', 'verified', 'rejected') or verification_status is null),
  add column if not exists insurance_policy_number text,
  add column if not exists insurance_coverage text,
  add column if not exists insurance_start date,
  add column if not exists insurance_end date,
  add column if not exists insurance_provider text,
  add column if not exists payment_cycle text default 'monthly' check (payment_cycle in ('monthly', 'biweekly') or payment_cycle is null),
  add column if not exists payout_threshold_min numeric default 0;

comment on column public.supplier_profiles.verification_status is 'pending = not verified; verified = can publish; rejected = blocked';

-- -----------------------------------------------------------------------------
-- 2. Bookings: cancellation reason, refund choice, cancelled_at, acknowledged_at
-- -----------------------------------------------------------------------------
alter table public.bookings
  add column if not exists cancellation_reason text,
  add column if not exists refund_choice text check (refund_choice in ('full_refund', 'no_refund', 'reschedule') or refund_choice is null),
  add column if not exists cancelled_at timestamptz,
  add column if not exists acknowledged_at timestamptz;

-- -----------------------------------------------------------------------------
-- 3. Review replies (supplier responds to customer review)
-- -----------------------------------------------------------------------------
create table if not exists public.review_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  supplier_id uuid not null references auth.users(id) on delete cascade,
  reply_text text not null,
  created_at timestamptz default now() not null
);

create unique index if not exists review_replies_review_unique on public.review_replies(review_id);
create index if not exists review_replies_supplier_id on public.review_replies(supplier_id);

alter table public.review_replies enable row level security;

drop policy if exists "Anyone can read review replies" on public.review_replies;
create policy "Anyone can read review replies"
  on public.review_replies for select using (true);

drop policy if exists "Suppliers can insert reply for own listing's review" on public.review_replies;
create policy "Suppliers can insert reply for own listing's review"
  on public.review_replies for insert
  with check (
    auth.uid() = supplier_id
    and exists (
      select 1 from public.reviews r
      join public.listings l on l.id = r.listing_id
      where r.id = review_id and l.supplier_id = auth.uid()
    )
  );

drop policy if exists "Suppliers can update own reply" on public.review_replies;
create policy "Suppliers can update own reply"
  on public.review_replies for update
  using (auth.uid() = supplier_id)
  with check (auth.uid() = supplier_id);

-- -----------------------------------------------------------------------------
-- 4. Listings: meeting point and pickup instructions
-- -----------------------------------------------------------------------------
alter table public.listings
  add column if not exists meeting_point text,
  add column if not exists pickup_instructions text;

-- -----------------------------------------------------------------------------
-- 5. Supplier earnings: invoice and payment reference (for PDF/receipts)
-- -----------------------------------------------------------------------------
alter table public.supplier_earnings
  add column if not exists invoice_number text,
  add column if not exists payment_reference text;
