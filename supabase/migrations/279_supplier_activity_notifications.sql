-- In-app supplier activity notifications (bell). Written by notify-supplier-event
-- after trusted review/booking resolution — not from untrusted client inserts.

create table if not exists public.supplier_activity_notifications (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  title text not null,
  body text not null,
  listing_id uuid references public.listings (id) on delete set null,
  review_id uuid references public.reviews (id) on delete set null,
  href_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.supplier_activity_notifications is
  'Partner in-app notifications. Inserts are service-role only (notify-supplier-event).';

-- One new-review notification per review (edits must not create another).
create unique index if not exists supplier_activity_notifications_new_review_uidx
  on public.supplier_activity_notifications (supplier_id, review_id)
  where event_type = 'new_review' and review_id is not null;

create index if not exists supplier_activity_notifications_supplier_created_idx
  on public.supplier_activity_notifications (supplier_id, created_at desc);

create index if not exists supplier_activity_notifications_supplier_unread_idx
  on public.supplier_activity_notifications (supplier_id)
  where read_at is null;

alter table public.supplier_activity_notifications enable row level security;

drop policy if exists supplier_activity_notifications_select_party on public.supplier_activity_notifications;
create policy supplier_activity_notifications_select_party
  on public.supplier_activity_notifications
  for select
  to authenticated
  using (
    supplier_id = auth.uid()
    or public.auth_is_supplier_team_member(supplier_id::text)
  );

drop policy if exists supplier_activity_notifications_update_read on public.supplier_activity_notifications;
create policy supplier_activity_notifications_update_read
  on public.supplier_activity_notifications
  for update
  to authenticated
  using (
    supplier_id = auth.uid()
    or public.auth_is_supplier_team_member(supplier_id::text)
  )
  with check (
    supplier_id = auth.uid()
    or public.auth_is_supplier_team_member(supplier_id::text)
  );

-- No client INSERT/DELETE — edge function uses service role.
revoke insert, delete on public.supplier_activity_notifications from authenticated;
grant select, update on public.supplier_activity_notifications to authenticated;
