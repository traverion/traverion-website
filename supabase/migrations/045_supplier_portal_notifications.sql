-- In-app notices shown on the supplier dashboard (global or per-supplier). Managed by Traverion panel admins.

CREATE TABLE IF NOT EXISTS public.supplier_portal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  variant text NOT NULL DEFAULT 'info' CHECK (variant IN ('info', 'warning', 'success')),
  audience text NOT NULL CHECK (audience IN ('all', 'supplier')),
  supplier_user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_portal_notifications_target_ok CHECK (
    (audience = 'all' AND supplier_user_id IS NULL)
    OR (audience = 'supplier' AND supplier_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS supplier_portal_notifications_created_at_idx
  ON public.supplier_portal_notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS supplier_portal_notifications_supplier_idx
  ON public.supplier_portal_notifications (supplier_user_id)
  WHERE audience = 'supplier';

COMMENT ON TABLE public.supplier_portal_notifications IS 'Dashboard banners for suppliers: audience all = every supplier; supplier = one auth user id.';

ALTER TABLE public.supplier_portal_notifications ENABLE ROW LEVEL SECURITY;

-- Suppliers: global rows + rows addressed to them
CREATE POLICY supplier_portal_notifications_select_own
  ON public.supplier_portal_notifications
  FOR SELECT
  TO authenticated
  USING (
    audience = 'all'
    OR (audience = 'supplier' AND supplier_user_id = auth.uid())
  );

-- Traverion panel (same allowlist as other staff tools)
CREATE POLICY supplier_portal_notifications_admin_all
  ON public.supplier_portal_notifications
  FOR ALL
  TO authenticated
  USING (public.is_traverion_panel_admin())
  WITH CHECK (public.is_traverion_panel_admin());

GRANT SELECT ON public.supplier_portal_notifications TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.supplier_portal_notifications TO authenticated;
