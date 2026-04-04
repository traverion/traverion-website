-- Grant Traverion staff access to the /admin dashboard and admin-supplier-verification Edge Function.
-- 1. Create the user in Supabase Auth (Dashboard → Authentication → Users) or sign up on the site first.
-- 2. Replace the email below with your staff account (lowercase).
-- 3. Run in SQL Editor as postgres.

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
where lower(email) = lower('your-staff-email@example.com');

-- Verify:
-- select id, email, raw_app_meta_data from auth.users where lower(email) = lower('your-staff-email@example.com');
