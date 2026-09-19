#!/usr/bin/env node
/**
 * Reset Partner demo data only (demo supplier + tagged listings/bookings).
 *
 * Usage:
 *   ALLOW_PARTNER_DEMO_RESET=1 SUPABASE_SERVICE_ROLE_KEY=... node scripts/partner-demo-reset.cjs
 */
const { createClient } = require('@supabase/supabase-js');
const {
  DEMO_EMAIL_DOMAIN,
  DEMO_SUPPLIER_EMAIL,
  DEMO_TAG,
  IDS,
  assertResetAllowed,
  resolveSupabase,
} = require('./partner-demo-lib.cjs');

assertResetAllowed();
const { url, serviceKey } = resolveSupabase();
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: byEmail } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const demoUsers = (byEmail?.users ?? []).filter(
    (u) =>
      u.email === DEMO_SUPPLIER_EMAIL ||
      (u.email && u.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`)) ||
      u.id === IDS.supplier ||
      Object.values(IDS.travelers).includes(u.id)
  );

  const supplierIds = new Set(
    demoUsers.filter((u) => u.email === DEMO_SUPPLIER_EMAIL || u.id === IDS.supplier).map((u) => u.id)
  );
  if (supplierIds.size === 0) supplierIds.add(IDS.supplier);

  for (const supplierId of supplierIds) {
    const { data: listings } = await admin.from('listings').select('id, tags').eq('supplier_id', supplierId);
    const listingIds = (listings ?? [])
      .filter((l) => {
        const tags = Array.isArray(l.tags) ? l.tags : [];
        return tags.includes(DEMO_TAG) || true; // all listings under demo supplier
      })
      .map((l) => l.id);

    if (listingIds.length) {
      const { data: bks } = await admin.from('bookings').select('id').in('listing_id', listingIds);
      const bookingIds = (bks ?? []).map((r) => r.id);
      if (bookingIds.length) {
        await admin.from('booking_messages').delete().in('booking_id', bookingIds);
        await admin.from('cancellation_requests').delete().in('booking_id', bookingIds);
        await admin.from('supplier_ledger_entries').delete().in('booking_id', bookingIds);
        const { data: revs } = await admin.from('reviews').select('id').in('booking_id', bookingIds);
        const reviewIds = (revs ?? []).map((r) => r.id);
        if (reviewIds.length) await admin.from('review_replies').delete().in('review_id', reviewIds);
        await admin.from('reviews').delete().in('listing_id', listingIds);
        await admin.from('bookings').delete().in('id', bookingIds);
      }
      await admin.from('listing_availability').delete().in('listing_id', listingIds);
      await admin.from('listing_discounts').delete().in('listing_id', listingIds);
      await admin.from('listings').delete().in('id', listingIds);
    }
    await admin.from('supplier_profiles').delete().eq('id', supplierId);
  }

  for (const u of demoUsers) {
    await admin.auth.admin.deleteUser(u.id);
  }

  console.log('Partner demo reset complete. Removed', demoUsers.length, 'auth users.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
