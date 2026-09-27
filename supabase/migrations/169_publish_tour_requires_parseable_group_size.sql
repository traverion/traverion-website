-- Phase 1241: No-option tour publish requires parseable group_size (client 1240 / edge 1228).
-- Starting price alone is not bookable when party bounds cannot be parsed.

create or replace function public.listing_group_size_is_parseable(p_group_size text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_group_size, '') ~ '(\d+)\s*[-–]\s*(\d+)';
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
  v_opts jsonb := coalesce(v_extras->'bookingOptions', '[]'::jsonb);
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
      -- Phase 1241: legacy no-option surface needs parseable group_size for quote party bounds.
      if jsonb_typeof(v_opts) is distinct from 'array' or jsonb_array_length(v_opts) = 0 then
        if not public.listing_group_size_is_parseable(new.group_size) then
          raise exception 'Publishing without booking options requires a parseable group size (for example 1-8 guests).';
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

COMMENT ON FUNCTION public.listing_group_size_is_parseable(text) IS
  'True when group_size contains a min–max digit range (Phase 1241).';

COMMENT ON FUNCTION public.enforce_listing_publish_content_minimums() IS
  'Server-side publish transition guard (095–102 + 1241): city/country, hero, tour/stay bookable surface; no-option tours need parseable group_size.';
