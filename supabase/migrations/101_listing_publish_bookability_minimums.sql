-- Phase 854: extend publish content minimums with bookability floor.
--
-- Migration 095 already blocks draft→published without city/country and a
-- non-placeholder hero. Client getListingPublishBlockers() also requires
-- bookable options/schedules (or a positive stay nightly / starting price),
-- but a verified supplier can still PATCH status='published' via REST with
-- empty bookingOptions / $0 schedules — travelers then see a live card that
-- cannot quote. Quote rejects at checkout, but search/discovery already lied.
--
-- Still deliberately narrow: we do NOT re-implement the whole TS publish gate
-- in SQL (duration/meeting copy/gallery polish). Only "is there a bookable
-- commercial surface?" for tours (ready schedule with priceUsd > 0, or legacy
-- option priceUsd > 0, or starting_from when no options) and stays
-- (nightlyPriceUsd or price_starting_from > 0 and maxGuests >= 1).
--
-- Same transition-only semantics as 095: gates entering published, not
-- subsequent edits to an already-published row.

create or replace function public.listing_has_bookable_tour_surface(p_extras jsonb, p_starting numeric)
returns boolean
language plpgsql
immutable
as $$
declare
  v_opts jsonb := coalesce(p_extras->'bookingOptions', '[]'::jsonb);
  v_opt jsonb;
  v_sch jsonb;
  v_has_schedules boolean;
  v_ready_priced boolean;
begin
  if jsonb_typeof(v_opts) is distinct from 'array' or jsonb_array_length(v_opts) = 0 then
    return coalesce(p_starting, 0) > 0;
  end if;

  for v_opt in select value from jsonb_array_elements(v_opts)
  loop
    v_has_schedules := jsonb_typeof(v_opt->'schedules') = 'array';
    if v_has_schedules then
      v_ready_priced := false;
      for v_sch in select value from jsonb_array_elements(v_opt->'schedules')
      loop
        if coalesce(v_sch->>'status', '') = 'ready'
           and coalesce(nullif(v_sch->>'priceUsd', '')::numeric, 0) > 0 then
          v_ready_priced := true;
          exit;
        end if;
      end loop;
      if v_ready_priced then
        return true;
      end if;
    else
      if coalesce(nullif(v_opt->>'priceUsd', '')::numeric, 0) > 0 then
        return true;
      end if;
    end if;
  end loop;

  return false;
end;
$$;

create or replace function public.listing_has_bookable_stay_surface(p_extras jsonb, p_starting numeric)
returns boolean
language sql
immutable
as $$
  select
    coalesce(nullif(p_extras->'stay'->>'nightlyPriceUsd', '')::numeric, coalesce(p_starting, 0)) > 0
    and coalesce(nullif(p_extras->'stay'->>'maxGuests', '')::int, 0) >= 1;
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
        raise exception 'Publishing a stay requires a nightly price greater than zero and a guest capacity of at least 1.';
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

comment on function public.enforce_listing_publish_content_minimums() is
  'Server-side publish transition guard (095 + 101): city/country, non-placeholder hero, and a bookable tour/stay commercial surface. Does not re-check soft UX polish from getListingPublishBlockers.';

comment on function public.listing_has_bookable_tour_surface(jsonb, numeric) is
  'True when listing_extras has a ready-priced schedule, a legacy option priceUsd > 0, or (no options) price_starting_from > 0.';

comment on function public.listing_has_bookable_stay_surface(jsonb, numeric) is
  'True when stay nightly (or starting_from) > 0 and maxGuests >= 1.';

-- Trigger already exists from 095; recreate to bind the replaced function.
drop trigger if exists listings_publish_content_minimums_guard on public.listings;
create trigger listings_publish_content_minimums_guard
  before insert or update on public.listings
  for each row
  execute function public.enforce_listing_publish_content_minimums();
