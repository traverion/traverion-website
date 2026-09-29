-- Phase 1701: Contact / Support form could not return the new inquiry id to the
-- browser, so notify-contact-inquiry never ran and Support never got the email.
--
-- Root cause: public.contact_inquiries has INSERT RLS for anon/authenticated but
-- no SELECT policy. PostgREST INSERT … RETURNING (supabase-js
-- .insert().select('id')) is gated by SELECT policies, so the client received
-- an empty/error result after a successful write and aborted before invoking
-- the edge function. Affiliate and content-creator forms share the same path.
--
-- Fix: SECURITY DEFINER RPC inserts and returns the id without exposing a
-- public SELECT over the table (admin still reads via service role).

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
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_subject text := btrim(coalesce(p_subject, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_type text := lower(btrim(coalesce(p_inquiry_type, 'general')));
  v_id uuid;
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
  if v_message = '' or char_length(v_message) > 5000 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
  if v_type not in ('general', 'affiliate', 'content_creator') then
    raise exception 'invalid_inquiry_type' using errcode = '22023';
  end if;
  if v_phone is not null and char_length(v_phone) > 40 then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  insert into public.contact_inquiries (
    name,
    email,
    phone,
    subject,
    message,
    inquiry_type,
    status
  )
  values (
    v_name,
    v_email,
    v_phone,
    v_subject,
    v_message,
    v_type,
    'new'
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.submit_contact_inquiry(text, text, text, text, text, text) is
  'Phase 1701: anon/authenticated contact form insert that returns inquiry id without public SELECT RLS.';

revoke all on function public.submit_contact_inquiry(text, text, text, text, text, text) from public;
grant execute on function public.submit_contact_inquiry(text, text, text, text, text, text) to anon, authenticated;
