/**
 * Shared constants + helpers for Partner demo seed/reset.
 * Demo data is tagged and isolated to one supplier identity.
 */
const DEMO_TAG = '__traverion_partner_demo__';
const DEMO_EMAIL_DOMAIN = 'partner-demo.traverion.invalid';
const DEMO_SUPPLIER_EMAIL = `aurora-ops@${DEMO_EMAIL_DOMAIN}`;
const DEMO_SUPPLIER_PASSWORD = 'PartnerDemo!Traverion2026';
const DEMO_META_KEY = 'traverion_partner_demo';

/** Deterministic UUIDs (version-4 shaped, fixed for reset). */
const IDS = {
  supplier: 'a11ce001-d000-4000-8000-000000000001',
  travelers: {
    anna: 'a11ce001-d000-4000-8000-000000000011',
    markus: 'a11ce001-d000-4000-8000-000000000012',
    elena: 'a11ce001-d000-4000-8000-000000000013',
    jonas: 'a11ce001-d000-4000-8000-000000000014',
    sofia: 'a11ce001-d000-4000-8000-000000000015',
  },
  listings: {
    northernLights: 'a11ce001-d000-4000-8000-000000000101',
    iceFishing: 'a11ce001-d000-4000-8000-000000000102',
    ranua: 'a11ce001-d000-4000-8000-000000000103',
    airportTransfer: 'a11ce001-d000-4000-8000-000000000104',
    apartment: 'a11ce001-d000-4000-8000-000000000105',
    draftAurora: 'a11ce001-d000-4000-8000-000000000106',
  },
  options: {
    nlShared: 'a11ce001-d000-4000-8000-000000000201',
    nlPrivate: 'a11ce001-d000-4000-8000-000000000202',
    ice: 'a11ce001-d000-4000-8000-000000000203',
    ranua: 'a11ce001-d000-4000-8000-000000000204',
    transfer: 'a11ce001-d000-4000-8000-000000000205',
  },
  bookings: {
    todayNlShared: 'a11ce001-d000-4000-8000-000000000301',
    todayNlPrivate: 'a11ce001-d000-4000-8000-000000000302',
    todayIcePickupGap: 'a11ce001-d000-4000-8000-000000000303',
    tomorrowNl: 'a11ce001-d000-4000-8000-000000000304',
    tomorrowTransfer: 'a11ce001-d000-4000-8000-000000000305',
    nextWeekRanua: 'a11ce001-d000-4000-8000-000000000306',
    stayUpcoming: 'a11ce001-d000-4000-8000-000000000307',
    unpaidCheckout: 'a11ce001-d000-4000-8000-000000000308',
    cancelRequest: 'a11ce001-d000-4000-8000-000000000309',
    cancelled: 'a11ce001-d000-4000-8000-000000000310',
    completedPast: 'a11ce001-d000-4000-8000-000000000311',
    completedPast2: 'a11ce001-d000-4000-8000-000000000312',
    recentPaid: 'a11ce001-d000-4000-8000-000000000313',
  },
  cancelReq: 'a11ce001-d000-4000-8000-000000000401',
  reviews: {
    excellent: 'a11ce001-d000-4000-8000-000000000501',
    short: 'a11ce001-d000-4000-8000-000000000502',
    awaiting: 'a11ce001-d000-4000-8000-000000000503',
  },
  reply: 'a11ce001-d000-4000-8000-000000000511',
  discounts: {
    active: 'a11ce001-d000-4000-8000-000000000601',
    upcoming: 'a11ce001-d000-4000-8000-000000000602',
    expired: 'a11ce001-d000-4000-8000-000000000603',
  },
};

function assertSeedAllowed() {
  if (process.env.ALLOW_PARTNER_DEMO_SEED !== '1') {
    console.error(
      'Refusing to seed. Set ALLOW_PARTNER_DEMO_SEED=1 and SUPABASE_SERVICE_ROLE_KEY.\n' +
        'This writes tagged demo rows into the configured Supabase project.'
    );
    process.exit(1);
  }
}

function assertResetAllowed() {
  if (process.env.ALLOW_PARTNER_DEMO_RESET !== '1') {
    console.error(
      'Refusing to reset. Set ALLOW_PARTNER_DEMO_RESET=1 and SUPABASE_SERVICE_ROLE_KEY.\n' +
        'This deletes ONLY the Partner demo supplier and tagged demo records.'
    );
    process.exit(1);
  }
}

function loadEnvFile(path) {
  try {
    const fs = require('fs');
    if (!fs.existsSync(path)) return;
    for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const key = m[1];
      if (process.env[key]) continue;
      process.env[key] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* ignore */
  }
}

function resolveSupabase() {
  loadEnvFile('.env');
  loadEnvFile('.env.local');
  loadEnvFile('.env.partner-demo.local');
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Need VITE_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  return { url, serviceKey };
}

function ymdHelsinki(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function isoDaysAgo(days, hour = 12) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 5, 0, 0);
  return d.toISOString();
}

module.exports = {
  DEMO_TAG,
  DEMO_EMAIL_DOMAIN,
  DEMO_SUPPLIER_EMAIL,
  DEMO_SUPPLIER_PASSWORD,
  DEMO_META_KEY,
  IDS,
  assertSeedAllowed,
  assertResetAllowed,
  resolveSupabase,
  ymdHelsinki,
  addDaysYmd,
  isoDaysAgo,
};
