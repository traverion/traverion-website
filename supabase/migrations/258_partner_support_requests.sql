-- Partner Support Center requests (supplier → Traverion ops email).
-- Rows are written only by the submit-partner-support edge function (service role).

create table if not exists public.partner_support_requests (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  supplier_id uuid not null,
  submitter_user_id uuid not null,
  request_type text not null,
  related_area text not null,
  subject text not null,
  message text not null,
  page_url text,
  attachment_names text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint partner_support_requests_request_type_check
    check (char_length(request_type) between 1 and 80),
  constraint partner_support_requests_related_area_check
    check (char_length(related_area) between 1 and 80),
  constraint partner_support_requests_subject_check
    check (char_length(subject) between 1 and 200),
  constraint partner_support_requests_message_check
    check (char_length(message) between 1 and 8000)
);

create index if not exists partner_support_requests_supplier_created_idx
  on public.partner_support_requests (supplier_id, created_at desc);

create index if not exists partner_support_requests_submitter_created_idx
  on public.partner_support_requests (submitter_user_id, created_at desc);

alter table public.partner_support_requests enable row level security;

-- No client policies: suppliers submit via the edge function; staff use service role.
revoke all on public.partner_support_requests from anon, authenticated;
grant select, insert on public.partner_support_requests to service_role;
