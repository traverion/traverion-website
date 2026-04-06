-- Short subtitle under the listing title on the public page (supplier-edited, max length enforced in app).
alter table public.listings
  add column if not exists listing_subtitle text;

comment on column public.listings.listing_subtitle is 'Optional tagline under title; app limits to 300 characters.';
