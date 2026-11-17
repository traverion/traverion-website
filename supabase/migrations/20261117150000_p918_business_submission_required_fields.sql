-- P9.18: Enforce mandatory business fields on NEW submissions / resubmissions.
-- Does not rewrite historical pending/verified rows that were submitted under older rules.
-- Fires only when a supplier moves into pending with a (new) verification_submitted_at.

create or replace function public.supplier_profiles_validate_business_submission()
returns trigger
language plpgsql
as $$
declare
  jwt_role text;
  country text;
  biz_type text;
  directors text;
  reg text;
  vat text;
  digits text;
  body text;
  check_digit int;
  expected int;
  sum int := 0;
  rem int;
  weights int[] := array[7, 9, 10, 5, 8, 4, 2];
  i int;
begin
  jwt_role := coalesce((select auth.jwt()) ->> 'role', '');
  -- Staff / service may approve or repair without this gate.
  if jwt_role = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  -- Only validate when entering (or re-entering) pending with a submitted timestamp.
  if new.verification_status is distinct from 'pending' then
    return new;
  end if;
  if new.verification_submitted_at is null then
    return new;
  end if;
  if not (
    old.verification_status is distinct from 'pending'
    or old.verification_submitted_at is distinct from new.verification_submitted_at
  ) then
    return new;
  end if;

  if nullif(trim(coalesce(new.display_name, '')), '') is null then
    raise exception using errcode = '23514', message = 'Brand name is required.';
  end if;
  if nullif(trim(coalesce(new.company_legal_name, '')), '') is null then
    raise exception using errcode = '23514', message = 'Registered legal name is required.';
  end if;

  biz_type := lower(trim(coalesce(new.business_type, '')));
  if biz_type not in ('company', 'individual') then
    raise exception using errcode = '23514', message = 'Business type is required.';
  end if;

  if nullif(trim(coalesce(new.contact_phone, '')), '') is null then
    raise exception using errcode = '23514', message = 'Contact phone is required.';
  end if;
  if nullif(trim(coalesce(new.address_street, '')), '') is null
    or nullif(trim(coalesce(new.address_city, '')), '') is null
    or nullif(trim(coalesce(new.address_postal_code, '')), '') is null
    or nullif(trim(coalesce(new.address_country, '')), '') is null
  then
    raise exception using errcode = '23514', message = 'Full registered address is required.';
  end if;

  country := upper(trim(coalesce(new.address_country, '')));
  if country = 'FINLAND' then
    country := 'FI';
  end if;

  if biz_type = 'company' then
    reg := trim(coalesce(new.company_registration_number, ''));
    if reg = '' then
      raise exception using errcode = '23514', message = 'Company registration number is required.';
    end if;

    directors := trim(coalesce(new.managing_directors, ''));
    if directors = '' then
      raise exception using errcode = '23514', message = 'At least one director is required.';
    end if;

    vat := upper(regexp_replace(trim(coalesce(new.vat_id, '')), '\s+', '', 'g'));
    if vat = '' then
      raise exception using errcode = '23514', message = 'VAT ID is required.';
    end if;

    if nullif(trim(coalesce(new.company_registration_document_path, '')), '') is null then
      raise exception using errcode = '23514',
        message = 'Business registration document is required.';
    end if;

    if country = 'FI' then
      digits := regexp_replace(reg, '\D', '', 'g');
      if length(digits) = 8 then
        body := substr(digits, 1, 7);
        check_digit := substr(digits, 8, 1)::int;
      elsif reg ~ '^\d{7}-\d$' then
        body := split_part(reg, '-', 1);
        check_digit := split_part(reg, '-', 2)::int;
      else
        raise exception using errcode = '23514',
          message = 'Enter a valid Finnish Business ID (for example 1234567-8).';
      end if;

      sum := 0;
      for i in 1..7 loop
        sum := sum + substr(body, i, 1)::int * weights[i];
      end loop;
      rem := sum % 11;
      if rem = 1 then
        raise exception using errcode = '23514',
          message = 'Enter a valid Finnish Business ID (for example 1234567-8).';
      elsif rem = 0 then
        expected := 0;
      else
        expected := 11 - rem;
      end if;
      if check_digit <> expected then
        raise exception using errcode = '23514',
          message = 'Enter a valid Finnish Business ID (for example 1234567-8).';
      end if;

      if vat ~ '^FI\d{8}$' then
        digits := substr(vat, 3);
      else
        digits := regexp_replace(vat, '\D', '', 'g');
      end if;
      if length(digits) <> 8 then
        raise exception using errcode = '23514',
          message = 'Enter a valid Finnish VAT ID (for example FI12345678).';
      end if;
      body := substr(digits, 1, 7);
      check_digit := substr(digits, 8, 1)::int;
      sum := 0;
      for i in 1..7 loop
        sum := sum + substr(body, i, 1)::int * weights[i];
      end loop;
      rem := sum % 11;
      if rem = 1 then
        raise exception using errcode = '23514',
          message = 'Enter a valid Finnish VAT ID (for example FI12345678).';
      elsif rem = 0 then
        expected := 0;
      else
        expected := 11 - rem;
      end if;
      if check_digit <> expected then
        raise exception using errcode = '23514',
          message = 'Enter a valid Finnish VAT ID (for example FI12345678).';
      end if;
    end if;
  elsif biz_type = 'individual' then
    if nullif(trim(coalesce(new.tax_id, '')), '') is null then
      raise exception using errcode = '23514', message = 'Tax or business ID is required.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists supplier_profiles_validate_business_submission on public.supplier_profiles;

create trigger supplier_profiles_validate_business_submission
  before update on public.supplier_profiles
  for each row
  execute function public.supplier_profiles_validate_business_submission();

comment on function public.supplier_profiles_validate_business_submission() is
  'P9.18: Validates mandatory business fields on new/resubmitted pending applications only.';
