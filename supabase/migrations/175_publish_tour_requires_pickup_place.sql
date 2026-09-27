-- Phase 1248: Tour publish bookability requires option pickup/meeting place (≥8 chars).
-- Client optionPublishIssues already gates this; REST could publish without it.

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
           and coalesce(nullif(v_sch->>'priceUsd', '')::numeric, 0) > 0
           and coalesce(v_max_persons, 0) >= 1
           and v_max_persons >= v_min_persons
           and coalesce(v_spots, 0) >= 1
           and coalesce(v_has_weekday, false)
           and length(v_start) >= 1 then
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
      if coalesce(nullif(v_opt->>'priceUsd', '')::numeric, 0) > 0
         and coalesce(v_max_persons, 0) >= 1
         and v_max_persons >= v_min_persons
         and coalesce(v_spots, 0) >= 1 then
        return true;
      end if;
    end if;
  end loop;

  return false;
end;
$$;

COMMENT ON FUNCTION public.listing_has_bookable_tour_surface(jsonb, numeric) IS
  'Tour publish surface: bookable option needs pickupPlace ≥8 plus schedule/option capacity (Phase 1248).';
