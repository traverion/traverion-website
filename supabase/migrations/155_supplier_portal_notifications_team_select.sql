-- Phase 1204: supplier-targeted portal banners for supplier team.
-- Migration 053 used supplier_user_id = auth.uid(); team JWTs missed
-- owner-addressed admin warnings. Keep audience = 'all' for every partner.

drop policy if exists supplier_portal_notifications_select_own on public.supplier_portal_notifications;
create policy supplier_portal_notifications_select_own
  on public.supplier_portal_notifications
  for select
  to authenticated
  using (
    audience = 'all'
    or (
      audience = 'supplier'
      and supplier_user_id is not null
      and public.is_supplier_account_side(supplier_user_id)
    )
  );
