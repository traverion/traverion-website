-- Anonymous public identity for traveler reviews.
-- Ownership remains on user_id / booking_id; only guest_name presentation changes.
-- comment stays nullable-with-default '' so rating-only reviews remain valid.

alter table public.reviews
  add column if not exists is_anonymous boolean not null default false;

comment on column public.reviews.is_anonymous is
  'When true, guest_name is a public anonymized label; user_id still owns the row.';

-- Prefer storing the public label when anonymous so SELECT policies that expose guest_name
-- never leak the traveler's real name to other customers or suppliers via presentation.
