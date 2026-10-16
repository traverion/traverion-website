-- Saved checkout selection for the signed-in traveler.
-- A row does not hold inventory and does not lock a price. Checkout revalidates both.

alter table public.cart_items
  add column if not exists option_id text,
  add column if not exists start_time text,
  add column if not exists participant_mix jsonb,
  add column if not exists currency text;

comment on column public.cart_items.option_id is
  'Selected booking option. Not an inventory hold.';
comment on column public.cart_items.participant_mix is
  'Participant quantities by category id. Revalidated at checkout and payment.';
