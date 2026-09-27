-- Phase 1238: Tour publish bookability requires maxPersons (stay maxGuests parity in 101).
-- After assert 1233/1235, a priced ready schedule without maxPersons still publishes via REST
-- but checkout fails closed — discovery lies. Extend listing_has_bookable_tour_surface.

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
  v_max_persons numeric;
begin
  if jsonb_typeof(v_opts) is distinct from 'array' or jsonb_array_length(v_opts) = 0 then
    -- Legacy no-option surface: starting price only (party capacity from group_size at quote).
    return coalesce(p_starting, 0) > 0;
  end if;

  for v_opt in select value from jsonb_array_elements(v_opts)
  loop
    v_has_schedules := jsonb_typeof(v_opt->'schedules') = 'array'
      and jsonb_array_length(v_opt->'schedules') > 0;
    if v_has_schedules then
      v_ready_priced := false;
      for v_sch in select value from jsonb_array_elements(v_opt->'schedules')
      loop
        v_max_persons := nullif(v_sch->>'maxPersons', '')::numeric;
        if coalesce(v_sch->>'status', '') = 'ready'
           and coalesce(nullif(v_sch->>'priceUsd', '')::numeric, 0) > 0
           and coalesce(v_max_persons, 0) >= 1 then
          v_ready_priced := true;
          exit;
        end if;
      end loop;
      if v_ready_priced then
        return true;
      end if;
    else
      v_max_persons := nullif(v_opt->>'maxPersons', '')::numeric;
      if coalesce(nullif(v_opt->>'priceUsd', '')::numeric, 0) > 0
         and coalesce(v_max_persons, 0) >= 1 then
        return true;
      end if;
    end if;
  end loop;

  return false;
end;
$$;

COMMENT ON FUNCTION public.listing_has_bookable_tour_surface(jsonb, numeric) IS
  'Tour publish surface: ready priced schedule/option with maxPersons >= 1 (Phase 1238).';
