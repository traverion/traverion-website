-- Single Traverion panel account listing (email). Authentication uses Supabase Auth (password there only).
-- The `password` column is a non-auth placeholder (default empty); set the real password in Dashboard → Authentication → Users.

CREATE TABLE public.admin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin IS 'Panel allowlist: only emails in this table may use the private panel (with Auth role admin).';
COMMENT ON COLUMN public.admin.password IS 'Not used for sign-in. Use Supabase Authentication for this user password. Leave empty unless you use this field for internal notes only.';

INSERT INTO public.admin (email, password)
VALUES (lower(trim('info.traverion@gmail.com')), '');

ALTER TABLE public.admin ENABLE ROW LEVEL SECURITY;

-- No policies: direct reads/writes from clients are blocked; service_role and SECURITY DEFINER RPC bypass RLS.
REVOKE ALL ON TABLE public.admin FROM anon, authenticated;

-- True when JWT email matches a row in public.admin (and user is authenticated).
CREATE OR REPLACE FUNCTION public.is_traverion_panel_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin a
    WHERE lower(trim(a.email)) = lower(trim(COALESCE(auth.jwt() ->> 'email', '')))
  );
$$;

REVOKE ALL ON FUNCTION public.is_traverion_panel_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_traverion_panel_admin() TO authenticated;
