-- Phase 1136: supplier team members are booking parties.
-- is_booking_party previously only matched listings.supplier_id = auth.uid(),
-- so team JWTs failed messaging / cancellation RPC gates that use this helper
-- even though notify edges already treat team as supplier-side (1130/1133).

create or replace function public.is_booking_party(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    join public.listings l on l.id = b.listing_id
    where b.id = p_booking_id
      and auth.uid() is not null
      and (
        l.supplier_id = auth.uid()
        or exists (
          select 1
          from public.supplier_team_members stm
          where stm.supplier_id = l.supplier_id::text
            and stm.user_id = auth.uid()
        )
        or b.guest_user_id = auth.uid()
        or (
          length(trim(coalesce(public.jwt_verified_email(), ''))) > 0
          and lower(trim(coalesce(b.guest_email, ''))) = public.jwt_verified_email()
        )
      )
  );
$$;

comment on function public.is_booking_party(uuid) is
  'True when auth.uid() is the listing supplier, a supplier_team_members row for that supplier, the booking guest_user_id, or a confirmed JWT email matching guest_email.';
