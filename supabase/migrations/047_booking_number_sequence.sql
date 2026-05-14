-- Global sequential booking order number: 1st row ever = 1, shown as #1 (like a restaurant ticket).

-- Remove legacy random-ref implementation if an older draft migration was applied
drop trigger if exists tr_bookings_assign_public_ref on public.bookings;
drop function if exists public.bookings_assign_public_ref();
drop index if exists public.bookings_public_booking_ref_key;
alter table public.bookings drop column if exists public_booking_ref;

create sequence if not exists public.bookings_booking_number_seq;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'booking_number'
  ) then
    alter table public.bookings add column booking_number bigint;
  end if;
end $$;

-- Historical order = row creation time (matches “Nth booking ever”)
with ordered as (
  select id, row_number() over (order by created_at asc nulls last, id asc) as rn
  from public.bookings
)
update public.bookings b
set booking_number = o.rn
from ordered o
where b.id = o.id;

select setval(
  'public.bookings_booking_number_seq',
  coalesce((select max(booking_number) from public.bookings), 0),
  true
);

alter table public.bookings
  alter column booking_number set default nextval('public.bookings_booking_number_seq');

alter sequence public.bookings_booking_number_seq owned by public.bookings.booking_number;

alter table public.bookings
  alter column booking_number set not null;

create unique index if not exists bookings_booking_number_key on public.bookings (booking_number);

comment on column public.bookings.booking_number is
  'App-wide sequential order number (1-based). Display as #N for guests and suppliers.';
