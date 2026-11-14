-- Publish requires short (≥100) and full (≥500) descriptions for every family.
-- Draft rows stay writable with incomplete copy. Existing live listings are not unpublished.

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
  v_has_check_in_address boolean;
  v_meet_len integer;
  v_pickup_len integer;
  v_stay_mode text := coalesce(nullif(trim(v_extras->'stay'->>'accommodationMode'), ''), 'single');
  v_short text;
  v_description text := trim(coalesce(new.description, ''));
begin
  if new.status = 'published' then
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

    if v_family = 'rental' then
      v_short := trim(coalesce(nullif(v_extras->'rental'->>'shortIntro', ''), coalesce(new.listing_subtitle, '')));
    else
      v_short := trim(coalesce(new.listing_subtitle, ''));
    end if;

    if char_length(v_short) < 100 then
      raise exception 'Publishing requires a short description of at least 100 characters.';
    end if;
    if char_length(v_description) < 500 then
      raise exception 'Publishing requires a full description of at least 500 characters.';
    end if;
    if char_length(v_description) > 3500 then
      raise exception 'Publishing requires a full description of 3500 characters or fewer.';
    end if;

    if v_family = 'rental' then
      if not public.listing_has_bookable_rental_surface(v_extras, new.price_starting_from) then
        raise exception 'Publishing a rental requires photos, pickup location, duration, cancellation, and at least one priced option with units.';
      end if;
    elsif v_family = 'stay' then
      if v_stay_mode = 'multi' then
        raise exception 'Publishing several room types is not available yet. Save this property as a draft.';
      end if;
      if not public.listing_has_bookable_stay_surface(v_extras, new.price_starting_from) then
        raise exception 'Publishing a stay requires a nightly price, guest capacity, and check-in/check-out times.';
      end if;
      select exists (
        select 1
        from public.listing_stay_private p
        where p.listing_id = new.id
          and length(trim(coalesce(p.check_in_address, ''))) >= 1
      )
      into v_has_check_in_address;
      if not coalesce(v_has_check_in_address, false) then
        raise exception 'Publishing a stay requires a check-in address.';
      end if;
    else
      if not public.listing_has_bookable_tour_surface(v_extras, new.price_starting_from) then
        raise exception 'Publishing requires at least one bookable option with a ready schedule and price greater than zero (or a starting price when options are not used).';
      end if;
      if jsonb_typeof(v_opts) is distinct from 'array' or jsonb_array_length(v_opts) = 0 then
        if not public.listing_group_size_is_parseable(new.group_size) then
          raise exception 'Publishing without booking options requires a parseable group size (for example 1-8 guests).';
        end if;
        v_meet_len := length(trim(coalesce(new.meeting_point, '')));
        v_pickup_len := length(trim(coalesce(new.pickup_instructions, '')));
        if coalesce(v_meet_len, 0) + coalesce(v_pickup_len, 0) < 12 then
          raise exception 'Publishing without booking options requires meeting point and/or pickup instructions.';
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_listing_publish_content_minimums() is
  'Publish guard: city/country/hero, short≥100 + full≥500 descriptions, and bookable surface for tour, stay, and rental. Drafts stay writable. Multi-unit stays remain drafts.';
