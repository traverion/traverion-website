-- Persist age/price category quantities on bookings (Adult ×2, Child ×1, …).
-- Stripe totals remain server-quoted; this column is truth for display on both sides.

alter table public.bookings
  add column if not exists guest_breakdown jsonb;

comment on column public.bookings.guest_breakdown is
  'Participant price-category mix for this booking: [{categoryId,label,kind,quantity,unitPrice}]. Null when uniform per-person pricing.';
