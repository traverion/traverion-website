-- Grant Traverion staff access to the /admin dashboard and admin-supplier-verification Edge Function.
-- 1. Create the user in Supabase Auth (Dashboard → Authentication → Users) or sign up on the site first.
-- 2. Replace the email below with your staff account (lowercase).
-- 3. Run in SQL Editor as postgres.
--
-- For strict access: also set VITE_TRAVERION_ADMIN_EMAILS (Vercel/local .env) and Edge secret TRAVERION_ADMIN_EMAILS
-- to the same comma-separated email(s). Password is whatever you set in Supabase Auth for that user (sign-up or Dashboard).
-- /admin sends anonymous users to /auth?next=admin first; after sign-in they return to the staff dashboard if allowed.

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
where lower(email) = lower('your-staff-email@example.com');

-- Verify:
-- select id, email, raw_app_meta_data from auth.users where lower(email) = lower('your-staff-email@example.com');
