-- Phase 1257: Tour publish priced surface matches listingShapeHasBookablePrice.
-- Accept age-dependent category prices and private flat_group prices, not only priceUsd.

create or replace function public.listing_shape_has_bookable_price(p_shape jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_flat numeric;
  v_cat jsonb;
  v_cat_price numeric;
begin
  if p_shape is null or jsonb_typeof(p_shape) is distinct from 'object' then
    return false;
  end if;

  if coalesce(p_shape->>'isPrivate', 'false') in ('true', 't')
     and coalesce(p_shape->>'privatePricing', '') = 'flat_group' then
    v_flat := nullif(p_shape->>'privateGroupPriceUsd', '')::numeric;
    if coalesce(v_flat, 0) > 0 then
      return true;
    end if;
  end if;

  if coalesce(p_shape->>'pricingMode', '') = 'age_dependent'
     and jsonb_typeof(p_shape->'priceCategories') = 'array' then
    for v_cat in select value from jsonb_array_elements(p_shape->'priceCategories')
    loop
      if coalesce(v_cat->>'notPermitted', 'false') in ('true', 't') then
        continue;
      end if;
      v_cat_price := nullif(v_cat->>'priceUsd', '')::numeric;
      if coalesce(v_cat_price, 0) > 0 then
        return true;
      end if;
    end loop;
  end if;

  return coalesce(nullif(p_shape->>'priceUsd', '')::numeric, 0) > 0;
end;
$$;

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
  v_min_persons numeric;
  v_max_persons numeric;
  v_spots numeric;
  v_weekdays jsonb;
  v_has_weekday boolean;
  v_start text;
  v_pickup text;
  v_from text;
begin
  if jsonb_typeof(v_opts) is distinct from 'array' or jsonb_array_length(v_opts) = 0 then
    return coalesce(p_starting, 0) > 0;
  end if;

  for v_opt in select value from jsonb_array_elements(v_opts)
  loop
    v_pickup := trim(coalesce(v_opt->>'pickupPlace', ''));
    if length(v_pickup) < 8 then
      continue;
    end if;

    v_has_schedules := jsonb_typeof(v_opt->'schedules') = 'array'
      and jsonb_array_length(v_opt->'schedules') > 0;
    if v_has_schedules then
      v_ready_priced := false;
      for v_sch in select value from jsonb_array_elements(v_opt->'schedules')
      loop
        v_min_persons := coalesce(nullif(v_sch->>'minPersons', '')::numeric, 1);
        v_max_persons := nullif(v_sch->>'maxPersons', '')::numeric;
        v_spots := nullif(v_sch->>'maxSpotsPerSlot', '')::numeric;
        v_start := trim(coalesce(v_sch->>'startTime', ''));
        v_from := trim(coalesce(v_sch->>'availabilityDateFrom', ''));
        v_weekdays := v_sch->'weekdays';
        v_has_weekday := false;
        if jsonb_typeof(v_weekdays) = 'array' then
          select exists (
            select 1
            from jsonb_array_elements(v_weekdays) w
            where w.value = 'true'::jsonb
          )
          into v_has_weekday;
        end if;
        if coalesce(v_sch->>'status', '') = 'ready'
           and public.listing_shape_has_bookable_price(v_sch)
           and coalesce(v_max_persons, 0) >= 1
           and v_max_persons >= v_min_persons
           and coalesce(v_spots, 0) >= 1
           and coalesce(v_has_weekday, false)
           and length(v_start) >= 1
           and length(v_from) >= 1 then
          v_ready_priced := true;
          exit;
        end if;
      end loop;
      if v_ready_priced then
        return true;
      end if;
    else
      v_min_persons := coalesce(nullif(v_opt->>'minPersons', '')::numeric, 1);
      v_max_persons := nullif(v_opt->>'maxPersons', '')::numeric;
      v_spots := nullif(v_opt->>'maxSpotsPerSlot', '')::numeric;
      v_start := trim(coalesce(v_opt->>'startTime', ''));
      v_weekdays := v_opt->'weekdays';
      v_has_weekday := false;
      if jsonb_typeof(v_weekdays) = 'array' then
        select exists (
          select 1
          from jsonb_array_elements(v_weekdays) w
          where w.value = 'true'::jsonb
        )
        into v_has_weekday;
      end if;
      if public.listing_shape_has_bookable_price(v_opt)
         and coalesce(v_max_persons, 0) >= 1
         and v_max_persons >= v_min_persons
         and coalesce(v_spots, 0) >= 1
         and coalesce(v_has_weekday, false)
         and length(v_start) >= 1 then
        return true;
      end if;
    end if;
  end loop;

  return false;
end;
$$;

COMMENT ON FUNCTION public.listing_shape_has_bookable_price(jsonb) IS
  'True when shape has priceUsd, age-dependent category, or private flat_group price (Phase 1257).';

COMMENT ON FUNCTION public.listing_has_bookable_tour_surface(jsonb, numeric) IS
  'Tour publish surface with priced-shape parity (Phase 1257).';
