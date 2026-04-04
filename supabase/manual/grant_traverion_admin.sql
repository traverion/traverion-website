-- Grant Traverion panel access (Supabase Auth + public.admin row + this role update).
-- 1. Run migration 037 (creates public.admin with info.traverion@gmail.com).
-- 2. Create the user in Dashboard → Authentication → Users (email info.traverion@gmail.com) and set the password there.
--    Real passwords live only in Auth — not in public.admin.password.
-- 3. Run this in SQL Editor as postgres (replace email if you changed the row in public.admin).

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
where lower(email) = lower('info.traverion@gmail.com');

-- Verify:
-- select id, email, raw_app_meta_data from auth.users where lower(email) = lower('info.traverion@gmail.com');
-- select * from public.admin;
