-- Phase 1734: Do not CASCADE-delete bookings when a listing is removed.
--
-- BEFORE: bookings.listing_id ON DELETE CASCADE wiped paid trips / Money history
-- while Partner UI claimed confirmed bookings stay.
-- AFTER: ON DELETE RESTRICT — listing delete fails if any booking exists; partners
-- must take the listing offline (draft) instead.

do $$
declare
  con_name text;
begin
  select c.conname into con_name
  from pg_constraint c
  join pg_class rel on rel.oid = c.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
    and rel.relname = 'bookings'
    and c.contype = 'f'
    and pg_get_constraintdef(c.oid) ilike '%listing_id%listings%';

  if con_name is null then
    raise exception 'bookings.listing_id foreign key not found';
  end if;

  execute format('alter table public.bookings drop constraint %I', con_name);
  alter table public.bookings
    add constraint bookings_listing_id_fkey
    foreign key (listing_id) references public.listings (id) on delete restrict;
end $$;

comment on constraint bookings_listing_id_fkey on public.bookings is
  'Phase 1734: RESTRICT so Partner Remove listing cannot wipe paid bookings / Money history.';
