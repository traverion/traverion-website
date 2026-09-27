-- Scratch verification: public tour remaining counts live holds like checkout.
begin;

create schema if not exists test_105;
set search_path to test_105, public;

create or replace function booking_occupies_inventory(
  p_status text,
  p_payment_status text,
  p_hold_expires_at timestamptz,
  p_created_at timestamptz
) returns boolean
language sql
stable
as $$
  select
    coalesce(p_status, '') is distinct from 'cancelled'
    and case lower(coalesce(p_payment_status, 'pending'))
      when 'paid' then true
      when 'complete' then true
      when 'succeeded' then true
      when 'pending' then
        case
          when p_hold_expires_at is not null then p_hold_expires_at > now()
          else coalesce(p_created_at, now()) > now() - interval '30 minutes'
        end
      else false
    end;
$$;

do $$
begin
  if not booking_occupies_inventory('pending', 'pending', now() + interval '10 minutes', now()) then
    raise exception 'live hold must occupy';
  end if;
  if booking_occupies_inventory('pending', 'pending', now() - interval '1 minute', now()) then
    raise exception 'expired hold must not occupy';
  end if;
  if booking_occupies_inventory('pending', 'failed', now() + interval '10 minutes', now()) then
    raise exception 'failed checkout must not occupy';
  end if;
  if not booking_occupies_inventory('confirmed', 'paid', null, now()) then
    raise exception 'paid must occupy';
  end if;
  if booking_occupies_inventory('confirmed', 'refunded', null, now()) then
    raise exception 'refunded must not occupy';
  end if;
  if booking_occupies_inventory('cancelled', 'paid', null, now()) then
    raise exception 'cancelled must not occupy';
  end if;
end $$;

rollback;
