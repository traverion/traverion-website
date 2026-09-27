-- Phase 1040: stop suppliers from inventing listings.rating / listings.reviews
-- via PostgREST. Marketplace cards and JSON-LD use real review aggregates;
-- these columns are legacy display leftovers that tourPackageToRow used to
-- write from client TourPackage fields (often 0, but forgeable).
--
-- Fix: BEFORE INSERT OR UPDATE trigger forces rating=0 and reviews=0 for
-- non-service_role writers. Service role / admin exempt for rare data fixes.
-- Client tourPackageToRow also omits the columns (Phase 1040 app change).

create or replace function public.listings_block_client_rating_reviews()
returns trigger
language plpgsql
as $$
declare
  jwt_role text;
begin
  jwt_role := coalesce((select auth.jwt()) ->> 'role', '');
  if jwt_role = 'service_role' then
    return new;
  end if;
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  new.rating := 0;
  new.reviews := 0;
  return new;
end;
$$;

drop trigger if exists listings_block_client_rating_reviews on public.listings;
create trigger listings_block_client_rating_reviews
  before insert or update on public.listings
  for each row
  execute function public.listings_block_client_rating_reviews();

comment on function public.listings_block_client_rating_reviews() is
  'Forces listings.rating/reviews to 0 for authenticated client writes — aggregates come from public.reviews (Phase 1040).';

-- One-shot: zero any previously invented values (display uses aggregates anyway).
update public.listings
set rating = 0, reviews = 0
where coalesce(rating, 0) <> 0 or coalesce(reviews, 0) <> 0;
