-- Phase 859: stay publish requires check-in and check-out times.
--
-- Client getListingPublishBlockers already requires HH:MM check-in/out for
-- stays. Migration 101 only gated nightly price + maxGuests, so REST could
-- publish a stay travelers cannot operationally arrive for.

create or replace function public.listing_has_bookable_stay_surface(p_extras jsonb, p_starting numeric)
returns boolean
language sql
immutable
as $$
  select
    coalesce(nullif(p_extras->'stay'->>'nightlyPriceUsd', '')::numeric, coalesce(p_starting, 0)) > 0
    and coalesce(nullif(p_extras->'stay'->>'maxGuests', '')::int, 0) >= 1
    and coalesce(p_extras->'stay'->>'checkInTime', '') ~ '^\d{2}:\d{2}$'
    and coalesce(p_extras->'stay'->>'checkOutTime', '') ~ '^\d{2}:\d{2}$';
$$;

create or replace function public.enforce_listing_publish_content_minimums()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city text := trim(coalesce(new.city, ''));
  v_country text := trim(coalesce(new.country, ''));
  v_image text := trim(coalesce(new.image, ''));
  v_is_placeholder boolean;
  v_extras jsonb := coalesce(new.listing_extras, '{}'::jsonb);
  v_family text := coalesce(nullif(trim(v_extras->>'inventoryFamily'), ''), 'tour');
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if v_city = '' or v_country = '' then
      raise exception 'Publishing requires both a city and a country.';
    end if;

    v_is_placeholder :=
      v_image = ''
      or v_image = 'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg'
      or v_image like '%pexels.com/photos/346885%';
    if v_is_placeholder then
      raise exception 'Publishing requires a real hero photo — the placeholder image cannot go live.';
    end if;

    if v_family = 'stay' then
      if not public.listing_has_bookable_stay_surface(v_extras, new.price_starting_from) then
        raise exception 'Publishing a stay requires a nightly price, guest capacity, and check-in/check-out times.';
      end if;
    else
      if not public.listing_has_bookable_tour_surface(v_extras, new.price_starting_from) then
        raise exception 'Publishing requires at least one bookable option with a ready schedule and price greater than zero (or a starting price when options are not used).';
      end if;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.listing_has_bookable_stay_surface(jsonb, numeric) is
  'True when stay nightly (or starting_from) > 0, maxGuests >= 1, and check-in/out times are HH:MM.';

comment on function public.enforce_listing_publish_content_minimums() is
  'Server-side publish transition guard (095 + 101 + 102): city/country, non-placeholder hero, tour bookable surface, stay nightly/capacity/check-in/out.';
