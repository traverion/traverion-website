-- Phase 1246: Published stays require a check-in address in listing_stay_private
-- (client publish gate parity). Enforced on listings UPDATE while published, and
-- blocked when clearing listing_stay_private for a live stay.

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
  v_entering_published boolean :=
    new.status = 'published'
    and (tg_op = 'INSERT' or old.status is distinct from 'published');
  v_has_check_in_address boolean;
begin
  if v_entering_published then
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
  end if;

  if new.status = 'published' then
    if v_family = 'stay' then
      if not public.listing_has_bookable_stay_surface(v_extras, new.price_starting_from) then
        raise exception 'Publishing a stay requires a nightly price, guest capacity, and check-in/check-out times.';
      end if;
      -- Phase 1246: address lives in listing_stay_private (not public extras).
      -- UPDATE only — INSERT published may create the private row after the listing row.
      if tg_op = 'UPDATE' then
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
      end if;
    else
      if not public.listing_has_bookable_tour_surface(v_extras, new.price_starting_from) then
        raise exception 'Publishing requires at least one bookable option with a ready schedule and price greater than zero (or a starting price when options are not used).';
      end if;
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

create or replace function public.enforce_listing_stay_private_while_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id uuid;
  v_status text;
  v_family text;
  v_address text;
begin
  v_listing_id := coalesce(new.listing_id, old.listing_id);
  select l.status, coalesce(nullif(trim(l.listing_extras->>'inventoryFamily'), ''), 'tour')
    into v_status, v_family
  from public.listings l
  where l.id = v_listing_id;

  if v_status is distinct from 'published' or v_family is distinct from 'stay' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Cannot clear check-in address while this stay is published.';
  end if;

  v_address := trim(coalesce(new.check_in_address, ''));
  if length(v_address) < 1 then
    raise exception 'Cannot clear check-in address while this stay is published.';
  end if;
  return new;
end;
$$;

drop trigger if exists listing_stay_private_while_published_guard on public.listing_stay_private;
create trigger listing_stay_private_while_published_guard
  before update or delete on public.listing_stay_private
  for each row
  execute function public.enforce_listing_stay_private_while_published();

COMMENT ON FUNCTION public.enforce_listing_publish_content_minimums() IS
  'Publish guard: city/country/hero on enter; bookable surface while published; stay check-in address on UPDATE (Phase 1246).';

COMMENT ON FUNCTION public.enforce_listing_stay_private_while_published() IS
  'Blocks clearing listing_stay_private check-in address while the stay is published (Phase 1246).';
