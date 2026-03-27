-- Enforce one supplier account per phone number (when provided).
create unique index if not exists supplier_profiles_contact_phone_unique
  on public.supplier_profiles (contact_phone)
  where contact_phone is not null and btrim(contact_phone) <> '';
