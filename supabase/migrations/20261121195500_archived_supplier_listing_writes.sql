-- An archived supplier cannot create, edit, or delete listings,
-- including with an access token issued before the archive.

create or replace function public.reject_writes_for_archived_supplier()
returns trigger
language plpgsql
as $$
declare
  sid uuid;
begin
  sid := nullif(coalesce(new.supplier_id, old.supplier_id)::text, '')::uuid;
  if sid is not null and exists (
    select 1 from public.supplier_profiles
    where id = sid and archived_at is not null
  ) then
    raise exception using errcode = '42501', message = 'This supplier account is archived.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists listings_reject_archived_supplier on public.listings;
create trigger listings_reject_archived_supplier
  before insert or update or delete on public.listings
  for each row execute function public.reject_writes_for_archived_supplier();
