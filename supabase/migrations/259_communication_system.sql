-- Traverion communication system: shared tracking for contact/affiliate/creator,
-- partner support email statuses, private attachment storage + upload sessions.
-- Preserves partner_support_requests and contact_inquiries rows.

-- ---------------------------------------------------------------------------
-- contact_inquiries: reference codes, structured fields, email delivery status
-- ---------------------------------------------------------------------------
alter table public.contact_inquiries
  add column if not exists reference_code text,
  add column if not exists booking_reference text,
  add column if not exists structured_data jsonb not null default '{}'::jsonb,
  add column if not exists upload_session_id uuid,
  add column if not exists internal_email_status text not null default 'pending',
  add column if not exists confirm_email_status text not null default 'pending',
  add column if not exists internal_provider_message_id text,
  add column if not exists confirm_provider_message_id text,
  add column if not exists last_email_attempt_at timestamptz;

create unique index if not exists contact_inquiries_reference_code_uidx
  on public.contact_inquiries (reference_code)
  where reference_code is not null;

alter table public.contact_inquiries
  drop constraint if exists contact_inquiries_internal_email_status_check;
alter table public.contact_inquiries
  add constraint contact_inquiries_internal_email_status_check
  check (internal_email_status in ('pending', 'queued', 'accepted', 'delivered', 'failed', 'skipped'));

alter table public.contact_inquiries
  drop constraint if exists contact_inquiries_confirm_email_status_check;
alter table public.contact_inquiries
  add constraint contact_inquiries_confirm_email_status_check
  check (confirm_email_status in ('pending', 'queued', 'accepted', 'delivered', 'failed', 'skipped'));

-- ---------------------------------------------------------------------------
-- partner_support_requests: email delivery tracking (preserve existing refs)
-- ---------------------------------------------------------------------------
alter table public.partner_support_requests
  add column if not exists upload_session_id uuid,
  add column if not exists internal_email_status text not null default 'pending',
  add column if not exists confirm_email_status text not null default 'pending',
  add column if not exists internal_provider_message_id text,
  add column if not exists confirm_provider_message_id text,
  add column if not exists last_email_attempt_at timestamptz,
  add column if not exists attachment_meta jsonb not null default '[]'::jsonb;

alter table public.partner_support_requests
  drop constraint if exists partner_support_internal_email_status_check;
alter table public.partner_support_requests
  add constraint partner_support_internal_email_status_check
  check (internal_email_status in ('pending', 'queued', 'accepted', 'delivered', 'failed', 'skipped'));

alter table public.partner_support_requests
  drop constraint if exists partner_support_confirm_email_status_check;
alter table public.partner_support_requests
  add constraint partner_support_confirm_email_status_check
  check (confirm_email_status in ('pending', 'queued', 'accepted', 'delivered', 'failed', 'skipped'));

-- ---------------------------------------------------------------------------
-- Upload sessions (short-lived auth for direct-to-storage uploads)
-- ---------------------------------------------------------------------------
create table if not exists public.communication_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  status text not null default 'open',
  submitter_user_id uuid,
  submitter_email text,
  client_token_hash text not null,
  max_files int not null default 5,
  max_total_bytes bigint not null default 157286400,
  expires_at timestamptz not null,
  finalized_at timestamptz,
  submission_kind text,
  submission_id uuid,
  created_at timestamptz not null default now(),
  constraint communication_upload_sessions_category_check
    check (category in ('partner_support', 'contact', 'affiliate', 'content_creator', 'supplier')),
  constraint communication_upload_sessions_status_check
    check (status in ('open', 'finalized', 'expired', 'abandoned'))
);

create index if not exists communication_upload_sessions_expires_idx
  on public.communication_upload_sessions (expires_at)
  where status = 'open';

create index if not exists communication_upload_sessions_submitter_idx
  on public.communication_upload_sessions (submitter_user_id, created_at desc);

alter table public.communication_upload_sessions enable row level security;
revoke all on public.communication_upload_sessions from anon, authenticated;
grant select, insert, update, delete on public.communication_upload_sessions to service_role;

-- ---------------------------------------------------------------------------
-- Attachment metadata (files live in private storage bucket)
-- ---------------------------------------------------------------------------
create table if not exists public.communication_attachments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.communication_upload_sessions(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  content_type text not null,
  byte_size bigint not null,
  kind text not null,
  checksum_sha256 text,
  status text not null default 'uploaded',
  submission_kind text,
  submission_id uuid,
  created_at timestamptz not null default now(),
  constraint communication_attachments_kind_check
    check (kind in ('image', 'pdf', 'video', 'other')),
  constraint communication_attachments_status_check
    check (status in ('pending', 'uploaded', 'linked', 'orphaned', 'deleted')),
  constraint communication_attachments_byte_size_check
    check (byte_size > 0 and byte_size <= 104857600)
);

create index if not exists communication_attachments_session_idx
  on public.communication_attachments (session_id);

create index if not exists communication_attachments_submission_idx
  on public.communication_attachments (submission_kind, submission_id)
  where submission_id is not null;

alter table public.communication_attachments enable row level security;
revoke all on public.communication_attachments from anon, authenticated;
grant select, insert, update, delete on public.communication_attachments to service_role;

-- ---------------------------------------------------------------------------
-- Private storage bucket (no public policies)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'communication-attachments',
  'communication-attachments',
  false,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No anon/authenticated storage policies: all access via service-role signed URLs.

-- ---------------------------------------------------------------------------
-- Reference code helper + updated contact RPC
-- ---------------------------------------------------------------------------
create or replace function public.communication_reference_code(p_prefix text)
returns text
language plpgsql
volatile
as $$
declare
  n int;
begin
  n := floor(random() * 1000000)::int;
  return upper(btrim(p_prefix)) || '-' || lpad(n::text, 6, '0');
end;
$$;

create or replace function public.submit_contact_inquiry(
  p_name text,
  p_email text,
  p_phone text,
  p_subject text,
  p_message text,
  p_inquiry_type text default 'general',
  p_booking_reference text default null,
  p_structured_data jsonb default '{}'::jsonb,
  p_upload_session_id uuid default null,
  p_client_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_subject text := btrim(coalesce(p_subject, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_type text := lower(btrim(coalesce(p_inquiry_type, 'general')));
  v_booking text := nullif(btrim(coalesce(p_booking_reference, '')), '');
  v_prefix text;
  v_ref text;
  v_id uuid;
  v_attempt int;
begin
  if v_name = '' or char_length(v_name) > 200 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if v_email = '' or char_length(v_email) > 320 or position('@' in v_email) < 2 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if v_subject = '' or char_length(v_subject) > 500 then
    raise exception 'invalid_subject' using errcode = '22023';
  end if;
  if v_message = '' or char_length(v_message) > 8000 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
  if v_type not in ('general', 'booking', 'trip', 'payment', 'partner', 'affiliate', 'content_creator', 'supplier') then
    raise exception 'invalid_inquiry_type' using errcode = '22023';
  end if;
  if v_phone is not null and char_length(v_phone) > 40 then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if v_booking is not null and char_length(v_booking) > 80 then
    raise exception 'invalid_booking_reference' using errcode = '22023';
  end if;

  v_prefix := case v_type
    when 'affiliate' then 'AF'
    when 'content_creator' then 'CR'
    when 'supplier' then 'SP'
    else 'CT'
  end;

  for v_attempt in 1..8 loop
    v_ref := public.communication_reference_code(v_prefix);
    begin
      insert into public.contact_inquiries (
        name,
        email,
        phone,
        subject,
        message,
        inquiry_type,
        status,
        reference_code,
        booking_reference,
        structured_data,
        upload_session_id
      )
      values (
        v_name,
        v_email,
        v_phone,
        v_subject,
        v_message,
        v_type,
        'new',
        v_ref,
        v_booking,
        coalesce(p_structured_data, '{}'::jsonb),
        p_upload_session_id
      )
      returning id into v_id;
      exit;
    exception
      when unique_violation then
        if v_attempt = 8 then
          raise;
        end if;
    end;
  end loop;

  return jsonb_build_object('id', v_id, 'reference', v_ref);
end;
$$;

comment on function public.submit_contact_inquiry(text, text, text, text, text, text, text, jsonb, uuid, text) is
  'Contact / affiliate / creator / supplier inquiry insert returning id + reference_code.';

revoke all on function public.submit_contact_inquiry(text, text, text, text, text, text, text, jsonb, uuid, text) from public;
grant execute on function public.submit_contact_inquiry(text, text, text, text, text, text, text, jsonb, uuid, text) to anon, authenticated;

-- Keep old 6-arg overload for any stale clients (delegates to new signature).
create or replace function public.submit_contact_inquiry(
  p_name text,
  p_email text,
  p_phone text,
  p_subject text,
  p_message text,
  p_inquiry_type text default 'general'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  v := public.submit_contact_inquiry(
    p_name, p_email, p_phone, p_subject, p_message, p_inquiry_type,
    null, '{}'::jsonb, null, null
  );
  return (v->>'id')::uuid;
end;
$$;

revoke all on function public.submit_contact_inquiry(text, text, text, text, text, text) from public;
grant execute on function public.submit_contact_inquiry(text, text, text, text, text, text) to anon, authenticated;
