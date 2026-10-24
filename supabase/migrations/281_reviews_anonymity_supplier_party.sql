-- Anonymous reviews: public sees "Anonymous traveler"; authorized listing suppliers
-- resolve the booking party (guest_name + public_reference) via bookings RLS / joins.
-- guest_name on reviews remains the public-safe label when is_anonymous.

comment on column public.reviews.is_anonymous is
  'When true, public surfaces must show Anonymous traveler. guest_name stores that public label. Authorized listing suppliers resolve the booking customer via bookings (guest_name, public_reference) — not from inventing names.';

comment on column public.reviews.guest_name is
  'Public display name. When is_anonymous, must be Anonymous traveler so world-readable SELECT never leaks a personal name.';

-- Enforce public-safe guest_name for anonymous rows (insert/update).
create or replace function public.reviews_enforce_anonymous_guest_name()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if coalesce(new.is_anonymous, false) then
    new.guest_name := 'Anonymous traveler';
  elsif new.guest_name is null or btrim(new.guest_name) = '' then
    new.guest_name := 'Guest';
  else
    new.guest_name := btrim(new.guest_name);
  end if;
  return new;
end;
$$;

drop trigger if exists tr_reviews_enforce_anonymous_guest_name on public.reviews;
create trigger tr_reviews_enforce_anonymous_guest_name
  before insert or update of is_anonymous, guest_name
  on public.reviews
  for each row
  execute function public.reviews_enforce_anonymous_guest_name();

-- Heal any anonymous rows that still hold a personal guest_name.
update public.reviews
set guest_name = 'Anonymous traveler'
where is_anonymous = true
  and guest_name is distinct from 'Anonymous traveler';

-- Public-safe projection: no user_id / booking_id (verified flag only).
-- security_invoker keeps reviews RLS (published listing / party / author).
create or replace view public.reviews_public
with (security_invoker = true) as
select
  r.id,
  r.listing_id,
  case
    when r.is_anonymous then 'Anonymous traveler'
    when nullif(btrim(coalesce(r.guest_name, '')), '') is null then 'Guest'
    else btrim(r.guest_name)
  end as guest_name,
  r.is_anonymous,
  r.rating,
  r.title,
  r.comment,
  r.images,
  r.created_at,
  (r.booking_id is not null) as verified
from public.reviews r
where r.hidden_at is null;

comment on view public.reviews_public is
  'Public listing reviews. Masks identity when is_anonymous; omits user_id and booking_id. Invokes reviews RLS.';

revoke all on public.reviews_public from public;
grant select on public.reviews_public to anon, authenticated;
