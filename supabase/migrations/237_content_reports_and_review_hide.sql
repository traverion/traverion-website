-- Phase 1865 / founder readiness: travelers can report abusive/fake reviews;
-- staff can hide a review from public discovery without deleting history.

alter table public.reviews
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_reason text;

comment on column public.reviews.hidden_at is
  'When set by Traverion staff, review is hidden from public listing SELECT.';
comment on column public.reviews.hidden_reason is
  'Staff reason for hide (moderation).';

drop policy if exists "Reviews are viewable by everyone" on public.reviews;
create policy "Reviews are viewable by everyone"
  on public.reviews for select
  using (
    (
      reviews.hidden_at is null
      or reviews.user_id = auth.uid()
      or exists (
        select 1
        from public.listings l
        where l.id = reviews.listing_id
          and public.is_supplier_account_side(l.supplier_id)
      )
    )
    and exists (
      select 1
      from public.listings l
      where l.id = reviews.listing_id
        and (
          l.status = 'published'
          or public.is_supplier_account_side(l.supplier_id)
          or reviews.user_id = auth.uid()
        )
    )
  );

comment on table public.reviews is
  'Traveler reviews. RLS (237): public SELECT requires published listing + not staff-hidden; author and listing supplier/team still see hidden rows.';

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  details text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  resolution_note text,
  constraint content_reports_target_type_check
    check (target_type in ('review', 'listing', 'message', 'supplier')),
  constraint content_reports_reason_check
    check (reason in ('spam', 'fake', 'abusive', 'harassment', 'irrelevant', 'other')),
  constraint content_reports_status_check
    check (status in ('open', 'resolved', 'dismissed')),
  constraint content_reports_details_len check (details is null or char_length(details) <= 2000),
  constraint content_reports_resolution_note_len check (resolution_note is null or char_length(resolution_note) <= 2000)
);

create unique index if not exists content_reports_reporter_target_unique
  on public.content_reports (reporter_user_id, target_type, target_id);

create index if not exists content_reports_status_created_idx
  on public.content_reports (status, created_at desc);

comment on table public.content_reports is
  'Traveler/staff safety reports. Insert via submit_content_report; staff manage via admin edge.';

alter table public.content_reports enable row level security;

revoke all on table public.content_reports from anon, authenticated;
grant select, insert on table public.content_reports to authenticated;

-- Reporters can see their own rows (status feedback). No public browse of others' reports.
drop policy if exists "content_reports_select_own" on public.content_reports;
create policy "content_reports_select_own"
  on public.content_reports for select
  using (reporter_user_id = auth.uid());

-- No direct INSERT policy — SECURITY DEFINER RPC only.
drop policy if exists "content_reports_insert_none" on public.content_reports;
create policy "content_reports_insert_none"
  on public.content_reports for insert
  with check (false);

create or replace function public.submit_content_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_type text := lower(btrim(coalesce(p_target_type, '')));
  v_reason text := lower(btrim(coalesce(p_reason, '')));
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_id uuid;
  v_visible boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_target_id is null then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  if v_type not in ('review', 'listing', 'message', 'supplier') then
    raise exception 'invalid_target_type' using errcode = '22023';
  end if;
  if v_reason not in ('spam', 'fake', 'abusive', 'harassment', 'irrelevant', 'other') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if v_details is not null and char_length(v_details) > 2000 then
    raise exception 'invalid_details' using errcode = '22023';
  end if;

  if v_type = 'review' then
    -- Public reporters may only flag non-hidden reviews on published listings.
    select exists (
      select 1
      from public.reviews r
      join public.listings l on l.id = r.listing_id
      where r.id = p_target_id
        and r.hidden_at is null
        and l.status = 'published'
    ) into v_visible;
  elsif v_type = 'listing' then
    select exists (
      select 1 from public.listings l
      where l.id = p_target_id and l.status = 'published'
    ) into v_visible;
  elsif v_type = 'message' then
    select exists (
      select 1 from public.booking_messages m
      where m.id = p_target_id and public.is_booking_party(m.booking_id)
    ) into v_visible;
  elsif v_type = 'supplier' then
    select exists (
      select 1 from public.supplier_profiles sp where sp.id = p_target_id
    ) into v_visible;
  end if;

  if not v_visible then
    raise exception 'target_not_found' using errcode = 'P0002';
  end if;

  insert into public.content_reports (
    reporter_user_id,
    target_type,
    target_id,
    reason,
    details,
    status
  )
  values (v_uid, v_type, p_target_id, v_reason, v_details, 'open')
  on conflict (reporter_user_id, target_type, target_id)
  do update set
    reason = excluded.reason,
    details = excluded.details,
    status = case
      when public.content_reports.status = 'open' then 'open'
      else public.content_reports.status
    end
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.submit_content_report(text, uuid, text, text) is
  'Authenticated reporter: create/update own open content report for a visible target.';

revoke all on function public.submit_content_report(text, uuid, text, text) from public;
grant execute on function public.submit_content_report(text, uuid, text, text) to authenticated;
