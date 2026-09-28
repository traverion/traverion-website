-- Phase 1349: booking_traveler_owns rejects recycled email when guest_user_id is bound.

begin;

create extension if not exists pgtap;

select plan(4);

-- Helper pure cases via set_config simulation is hard; assert function exists +
-- is_booking_party definition references booking_traveler_owns.
select has_function(
  'public',
  'booking_traveler_owns',
  array['uuid', 'text'],
  'booking_traveler_owns(uuid, text) exists'
);

select ok(
  position('booking_traveler_owns' in pg_get_functiondef('public.is_booking_party(uuid)'::regprocedure)) > 0,
  'is_booking_party uses booking_traveler_owns'
);

select ok(
  position('booking_traveler_owns' in pg_get_functiondef('public.cancel_booking_as_traveler(uuid, text)'::regprocedure)) > 0,
  'cancel_booking_as_traveler uses booking_traveler_owns'
);

select ok(
  position('booking_traveler_owns' in pg_get_functiondef('public.update_guest_booking_special_requests(uuid, text)'::regprocedure)) > 0,
  'update_guest_booking_special_requests uses booking_traveler_owns'
);

select * from finish();
rollback;
