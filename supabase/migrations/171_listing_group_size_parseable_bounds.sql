-- Phase 1243: listing_group_size_is_parseable matches parseGroupSizeRange
-- (min >= 1, max >= min) — not regex-only (rejects inverted ranges like 8-2).

create or replace function public.listing_group_size_is_parseable(p_group_size text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_min integer;
  v_max integer;
begin
  if coalesce(p_group_size, '') !~ '(\d+)\s*[-–]\s*(\d+)' then
    return false;
  end if;
  v_min := substring(p_group_size from '(\d+)\s*[-–]\s*\d+')::int;
  v_max := substring(p_group_size from '\d+\s*[-–]\s*(\d+)')::int;
  if v_min is null or v_max is null or v_min < 1 or v_max < v_min then
    return false;
  end if;
  return true;
end;
$$;

COMMENT ON FUNCTION public.listing_group_size_is_parseable(text) IS
  'True when group_size has min–max digits with min >= 1 and max >= min (Phase 1243).';
