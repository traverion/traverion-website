-- Traverion Rentals launch: lift migration 282's hard block on publishing rentals.
-- Replaces enforce_listing_publish_content_minimums with a rental branch that requires
-- a bookable rental surface (options + pricing + pickup), while keeping tour/stay rules
-- and the multi-unit stay draft block intact.

create or replace function public.listing_has_bookable_rental_surface(
  p_extras jsonb,
  p_starting numeric
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_rental jsonb := coalesce(p_extras->'rental', '{}'::jsonb);
  v_variants jsonb := coalesce(v_rental->'variants', '[]'::jsonb);
  v_shared jsonb := coalesce(v_rental->'sharedPricing', '{}'::jsonb);
  v_pickup text := trim(coalesce(v_rental->>'pickupAddress', ''));
  v_mode text := trim(coalesce(v_rental->>'durationMode', ''));
  v_cancel text := trim(coalesce(v_rental->>'cancellationPreset', ''));
  v_category text := trim(coalesce(v_rental->>'category', ''));
  v_item text := trim(coalesce(v_rental->>'itemType', ''));
  v_custom_item text := trim(coalesce(v_rental->>'customItemType', ''));
  v_gallery jsonb := coalesce(p_extras->'galleryImageUrls', '[]'::jsonb);
  v_n integer := 0;
  v_elem jsonb;
  v_qty integer;
  v_name text;
  v_day numeric;
  v_hour numeric;
  v_has_rate boolean := false;
begin
  if v_category = '' then
    return false;
  end if;
  if v_item = '' and v_custom_item = '' then
    return false;
  end if;
  if length(v_pickup) < 5 then
    return false;
  end if;
  if v_mode not in ('hourly', 'daily', 'both') then
    return false;
  end if;
  if v_cancel = '' then
    return false;
  end if;
  if jsonb_typeof(v_gallery) is distinct from 'array' or jsonb_array_length(v_gallery) < 2 then
    -- Cover is stored on listings.image; gallery must hold the remaining photos (3 total).
    return false;
  end if;
  if jsonb_typeof(v_variants) is distinct from 'array' or jsonb_array_length(v_variants) < 1 then
    return false;
  end if;

  for v_elem in select * from jsonb_array_elements(v_variants)
  loop
    v_n := v_n + 1;
    v_name := trim(coalesce(v_elem->>'name', ''));
    begin
      v_qty := coalesce((v_elem->>'quantity')::integer, 0);
    exception when others then
      v_qty := 0;
    end;
    if v_name = '' or v_qty < 1 then
      return false;
    end if;

    v_day := nullif(trim(coalesce(v_elem->'pricingOverride'->>'pricePerDayMinor', '')), '')::numeric;
    v_hour := nullif(trim(coalesce(v_elem->'pricingOverride'->>'pricePerHourMinor', '')), '')::numeric;
    if v_day is null then
      v_day := nullif(trim(coalesce(v_shared->>'pricePerDayMinor', '')), '')::numeric;
    end if;
    if v_hour is null then
      v_hour := nullif(trim(coalesce(v_shared->>'pricePerHourMinor', '')), '')::numeric;
    end if;

    if v_mode = 'hourly' then
      if v_hour is null or v_hour <= 0 then
        return false;
      end if;
    elsif v_mode = 'daily' then
      if v_day is null or v_day <= 0 then
        return false;
      end if;
    else
      if (v_day is null or v_day <= 0) and (v_hour is null or v_hour <= 0) then
        return false;
      end if;
    end if;
    v_has_rate := true;
  end loop;

  if v_n < 1 or not v_has_rate then
    return false;
  end if;

  if p_starting is null or p_starting <= 0 then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

comment on function public.listing_has_bookable_rental_surface(jsonb, numeric) is
  'True when rental extras include category, pickup, duration, cancellation, ≥1 priced option, and gallery companions for a 3-photo listing.';

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
  'Publish guard: city/country/hero + bookable surface for tour, stay, and rental. Multi-unit stays remain drafts.';
