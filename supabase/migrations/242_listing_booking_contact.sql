-- Listing-level booking contact phone for confirmed guests (never public listing_extras).
-- Partner editors read/write; travelers receive a frozen copy on purchase_snapshot at checkout.

create table if not exists public.listing_booking_contact (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  phone_e164 text not null,
  updated_at timestamptz not null default now(),
  constraint listing_booking_contact_phone_len check (
    char_length(trim(phone_e164)) between 8 and 24
  )
);

comment on table public.listing_booking_contact is
  'Owner/editor-only booking contact E.164. Not exposed on public listing reads; freeze onto purchase_snapshot at paid checkout.';

create index if not exists listing_booking_contact_updated_at_idx
  on public.listing_booking_contact (updated_at desc);

alter table public.listing_booking_contact enable row level security;

drop policy if exists "listing_booking_contact_select_owner" on public.listing_booking_contact;
create policy "listing_booking_contact_select_owner"
  on public.listing_booking_contact for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and public.is_supplier_account_editor(l.supplier_id)
    )
  );

drop policy if exists "listing_booking_contact_insert_owner" on public.listing_booking_contact;
create policy "listing_booking_contact_insert_owner"
  on public.listing_booking_contact for insert
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and public.is_supplier_account_editor(l.supplier_id)
    )
  );

drop policy if exists "listing_booking_contact_update_owner" on public.listing_booking_contact;
create policy "listing_booking_contact_update_owner"
  on public.listing_booking_contact for update
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and public.is_supplier_account_editor(l.supplier_id)
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and public.is_supplier_account_editor(l.supplier_id)
    )
  );

drop policy if exists "listing_booking_contact_delete_owner" on public.listing_booking_contact;
create policy "listing_booking_contact_delete_owner"
  on public.listing_booking_contact for delete
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and public.is_supplier_account_editor(l.supplier_id)
    )
  );

grant select, insert, update, delete on public.listing_booking_contact to authenticated;
grant all on public.listing_booking_contact to service_role;
