-- Primary language for the experience (BCP-47 style code, e.g. en, es) and high-level product type.
alter table public.listings
  add column if not exists experience_language text,
  add column if not exists experience_kind text
    check (
      experience_kind is null
      or experience_kind in ('tour', 'ticket', 'transportation')
    );

comment on column public.listings.experience_language is 'Primary language guests can expect (ISO 639-1 / BCP-47 code).';
comment on column public.listings.experience_kind is 'Product shape: guided tour, ticket/entry, or transportation service.';
