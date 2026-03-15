-- Listing discounts (supplier-defined: percent or fixed, optional code, validity window)
create table if not exists public.listing_discounts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  type text not null check (type in ('percent', 'fixed')),
  value numeric not null,
  code text,
  valid_from date,
  valid_until date,
  created_at timestamptz default now() not null
);

create index if not exists listing_discounts_listing_id on public.listing_discounts(listing_id);
create index if not exists listing_discounts_valid on public.listing_discounts(valid_from, valid_until);

alter table public.listing_discounts enable row level security;

create policy "Listings discounts: public read"
  on public.listing_discounts for select using (true);

create policy "Suppliers can insert discounts for own listings"
  on public.listing_discounts for insert
  with check (
    exists (
      select 1 from public.listings
      where listings.id = listing_discounts.listing_id
      and listings.supplier_id = auth.uid()
    )
  );

create policy "Suppliers can update/delete own listing discounts"
  on public.listing_discounts for update
  using (
    exists (
      select 1 from public.listings
      where listings.id = listing_discounts.listing_id
      and listings.supplier_id = auth.uid()
    )
  );

create policy "Suppliers can delete own listing discounts"
  on public.listing_discounts for delete
  using (
    exists (
      select 1 from public.listings
      where listings.id = listing_discounts.listing_id
      and listings.supplier_id = auth.uid()
    )
  );

-- Supplier earnings summary (per period; can be populated by app or cron)
create table if not exists public.supplier_earnings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  amount numeric not null default 0,
  currency text default 'USD',
  status text default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists supplier_earnings_supplier_id on public.supplier_earnings(supplier_id);

alter table public.supplier_earnings enable row level security;

create policy "Suppliers can view own earnings"
  on public.supplier_earnings for select
  using (auth.uid() = supplier_id);

create policy "Suppliers cannot insert/update earnings (system only)"
  on public.supplier_earnings for insert with check (false);
create policy "Supplier earnings no update"
  on public.supplier_earnings for update using (false);

drop trigger if exists supplier_earnings_updated_at on public.supplier_earnings;
create trigger supplier_earnings_updated_at
  before update on public.supplier_earnings
  for each row execute function public.set_updated_at();
