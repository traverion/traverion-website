-- Traverion: listings (tours/activities) and bookings
-- Run this in Supabase SQL Editor or via Supabase CLI: supabase db push

-- Listings: supplier-created tours/activities (maps to TourPackage in app)
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  destination text not null,
  duration text not null,
  style text default 'Tour',
  start_location text,
  end_location text,
  price_starting_from numeric not null default 0,
  price_currency text default 'USD',
  category text default '3*',
  tour_type text default 'cultural',
  validity text default 'Year round',
  image text,
  description text not null default '',
  highlights jsonb default '[]'::jsonb,
  itinerary jsonb default '[]'::jsonb,
  includes jsonb default '[]'::jsonb,
  excludes jsonb default '[]'::jsonb,
  difficulty text default 'Easy',
  group_size text default '2-12 People',
  best_time text default 'Year round',
  rating numeric default 4.5,
  reviews integer default 0,
  is_popular boolean default false,
  city text,
  region text,
  country text,
  tags jsonb default '[]'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Bookings: guest bookings for a listing
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  guest_email text,
  guests integer default 1,
  booking_date date,
  status text default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz default now() not null
);

-- Contact form submissions
create table if not exists public.contact_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  subject text not null,
  message text not null,
  inquiry_type text default 'general',
  status text default 'new',
  created_at timestamptz default now() not null
);

-- Optional: supplier profiles (display name, etc.)
create table if not exists public.supplier_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Indexes
create index if not exists listings_supplier_id on public.listings(supplier_id);
create index if not exists listings_country on public.listings(country);
create index if not exists listings_city on public.listings(city);
create index if not exists listings_created_at on public.listings(created_at desc);
create index if not exists bookings_listing_id on public.bookings(listing_id);

-- RLS
alter table public.listings enable row level security;
alter table public.bookings enable row level security;
alter table public.contact_inquiries enable row level security;
alter table public.supplier_profiles enable row level security;

-- Contact: anyone can insert
create policy "Anyone can submit contact inquiry"
  on public.contact_inquiries for insert
  with check (true);

-- Listings: anyone can read; only owner can insert/update/delete
create policy "Listings are viewable by everyone"
  on public.listings for select
  using (true);

create policy "Suppliers can insert own listings"
  on public.listings for insert
  with check (auth.uid() = supplier_id);

create policy "Suppliers can update own listings"
  on public.listings for update
  using (auth.uid() = supplier_id);

create policy "Suppliers can delete own listings"
  on public.listings for delete
  using (auth.uid() = supplier_id);

-- Bookings: anyone can create; listing owner can read their listing's bookings
create policy "Anyone can create bookings"
  on public.bookings for insert
  with check (true);

create policy "Suppliers can view bookings for their listings"
  on public.bookings for select
  using (
    exists (
      select 1 from public.listings
      where listings.id = bookings.listing_id
      and listings.supplier_id = auth.uid()
    )
  );

-- Supplier profiles: public read, own write
create policy "Profiles are viewable by everyone"
  on public.supplier_profiles for select
  using (true);

create policy "Users can insert own profile"
  on public.supplier_profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.supplier_profiles for update
  using (auth.uid() = id);

-- Trigger: updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists listings_updated_at on public.listings;
create trigger listings_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

drop trigger if exists supplier_profiles_updated_at on public.supplier_profiles;
create trigger supplier_profiles_updated_at
  before update on public.supplier_profiles
  for each row execute function public.set_updated_at();
