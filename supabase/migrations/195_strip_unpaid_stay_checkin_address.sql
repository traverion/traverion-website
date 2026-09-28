-- Phase 1358: Stay check-in address must not live on unpaid purchase_snapshot rows.
-- Phase 1325 stopped writing it at checkout; strip legacy holds and enforce on write.

update public.bookings
set purchase_snapshot = purchase_snapshot - 'checkInAddress'
where purchase_snapshot is not null
  and purchase_snapshot ? 'checkInAddress'
  and lower(trim(coalesce(payment_status, '')))
      not in ('paid', 'complete', 'succeeded', 'refunded');

create or replace function public.bookings_strip_unpaid_stay_checkin_address()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay text := lower(trim(coalesce(NEW.payment_status, '')));
begin
  if NEW.purchase_snapshot is null then
    return NEW;
  end if;
  if v_pay in ('paid', 'complete', 'succeeded', 'refunded') then
    return NEW;
  end if;
  if NEW.purchase_snapshot ? 'checkInAddress' then
    NEW.purchase_snapshot := NEW.purchase_snapshot - 'checkInAddress';
  end if;
  return NEW;
end;
$$;

drop trigger if exists bookings_strip_unpaid_stay_checkin_address on public.bookings;
create trigger bookings_strip_unpaid_stay_checkin_address
  before insert or update of purchase_snapshot, payment_status
  on public.bookings
  for each row
  execute function public.bookings_strip_unpaid_stay_checkin_address();

comment on function public.bookings_strip_unpaid_stay_checkin_address() is
  'Phase 1358: remove purchase_snapshot.checkInAddress while payment is not collected (listing_stay_private).';
