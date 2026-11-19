/**
 * P9.36 — Persistent layouts on Calendar, Bookings, Listings, and Inbox.
 * Reads the live supplier (does not create or delete records).
 * ORIGIN defaults to the local dev server; set ORIGIN for production.
 */
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT = 'xcopqllkulxfkpunetbc';
const BASE = `https://${PROJECT}.supabase.co`;
const EMAIL = 'contact@royalnordic.fi';
const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:5173';
const root = resolve(import.meta.dirname, '..');

function apiKeys() {
  const raw = execSync(`npx supabase projects api-keys --project-ref ${PROJECT}`, { encoding: 'utf8' });
  const parsed = JSON.parse(raw.slice(raw.indexOf('{')));
  const keys = parsed.keys || parsed;
  return {
    anon: keys.find((k) => k.name === 'anon' || k.id === 'anon')?.api_key,
    service: keys.find((k) => k.name === 'service_role' || k.id === 'service_role')?.api_key,
  };
}

const { anon, service } = apiKeys();
const admin = createClient(BASE, service, { auth: { persistSession: false, autoRefreshToken: false } });
const pub = createClient(BASE, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
if (link.error) throw new Error(link.error.message);
const verified = await pub.auth.verifyOtp({
  token_hash: link.data.properties.hashed_token,
  type: 'magiclink',
});
if (verified.error || !verified.data.session) throw new Error(verified.error?.message ?? 'no session');
const session = verified.data.session;

const checks = [];
function note(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail: detail ?? '' });
  console.log(ok ? 'PASS' : 'FAIL', name, detail ?? '');
}

function source(rel) {
  return readFileSync(resolve(root, rel), 'utf8');
}

const calendarSrc = source('src/pages/supplier/SupplierUnifiedCalendar.tsx');
const bookingsSrc = source('src/pages/supplier/SupplierBookings.tsx');
const listingsSrc = source('src/pages/supplier/SupplierListings.tsx');
const inboxSrc = source('src/pages/supplier/SupplierInbox.tsx');

note(
  'calendar keeps agenda dates when the window is empty',
  calendarSrc.includes('partnerUnifiedAgendaDays') && calendarSrc.includes('Nothing scheduled'),
);
note(
  'calendar does not replace the grid with an empty card',
  !calendarSrc.includes('title="No listings yet"') && !calendarSrc.includes('Nothing upcoming'),
);
note(
  'bookings keeps the workspace when there are no rows',
  bookingsSrc.includes('partner-bookings-workspace') &&
    bookingsSrc.includes('No bookings yet') &&
    bookingsSrc.indexOf('partner-bookings-workspace') < bookingsSrc.indexOf('No bookings yet'),
);
note(
  'listings keeps search and category filters with zero listings',
  listingsSrc.includes('Search title, destination, or reference') &&
    listingsSrc.includes("label: 'Tours'") &&
    listingsSrc.includes('No listings yet') &&
    listingsSrc.includes('Create listing'),
);
note(
  'inbox keeps both panels and search with zero conversations',
  inboxSrc.includes('Search conversations') &&
    inboxSrc.includes('No conversations yet') &&
    inboxSrc.includes('Select a conversation') &&
    inboxSrc.includes('tv-inbox-list-pane') &&
    inboxSrc.includes('tv-inbox-chat'),
);

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [
    { width: 1440, height: 900, label: 'desktop' },
    { width: 390, height: 844, label: 'mobile' },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.goto(`${ORIGIN}/partner/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(
      ({ key, session }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
            expires_in: session.expires_in,
            token_type: session.token_type ?? 'bearer',
            user: session.user,
          }),
        );
      },
      { key: `sb-${PROJECT}-auth-token`, session },
    );

    await page.goto(`${ORIGIN}/partner/calendar`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.getByRole('tab', { name: 'Agenda' }).waitFor({ timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector('.partner-unified-cal__loading'), null, { timeout: 25000 });
    note(`${viewport.label} calendar shows Agenda Week Month and Today`, (await page.getByRole('button', { name: 'Today' }).count()) > 0);
    const agendaText = await page.locator('.partner-unified-cal__agenda').innerText();
    note(
      `${viewport.label} agenda shows dates, including quiet days`,
      agendaText.includes('Nothing scheduled') || /[A-Z][a-z]+ \d/.test(agendaText),
      agendaText.slice(0, 90).replace(/\s+/g, ' '),
    );
    await page.getByRole('tab', { name: 'Week' }).click();
    await page.locator('.partner-unified-cal__week-col').first().waitFor({ timeout: 15000 });
    const weekCols = await page.locator('.partner-unified-cal__week-col').count();
    note(`${viewport.label} week shows seven days`, weekCols === 7, String(weekCols));
    await page.getByRole('tab', { name: 'Month' }).click();
    await page.locator('.partner-unified-cal__cell').first().waitFor({ timeout: 15000 });
    const monthCells = await page.locator('.partner-unified-cal__cell').count();
    const todayCells = await page.locator('.partner-unified-cal__cell.is-today').count();
    note(`${viewport.label} month grid includes every date`, monthCells >= 28, String(monthCells));
    note(`${viewport.label} month highlights today`, todayCells === 1, String(todayCells));
    note(
      `${viewport.label} calendar keeps filters`,
      (await page.getByRole('button', { name: /Filters|Filter/ }).count()) > 0,
    );

    await page.goto(`${ORIGIN}/partner/bookings`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const search = page.getByPlaceholder(/Search guest/);
    await search.waitFor({ timeout: 30000 });
    note(`${viewport.label} bookings keeps Tours Stays Rentals`, (await page.getByRole('button', { name: 'Tours' }).count()) > 0 && (await page.getByRole('button', { name: 'Stays' }).count()) > 0 && (await page.getByRole('button', { name: 'Rentals' }).count()) > 0);
    await page.locator('.partner-bookings-workspace').waitFor({ timeout: 25000 });
    await page.waitForFunction(() => !document.querySelector('[aria-label="Loading bookings"]'), null, { timeout: 25000 });
    const bookingRows = await page.locator('.partner-bookings-workspace__list > *').count();
    const genuineEmpty = await page.getByText(/No bookings yet|No reservations yet|No rental bookings yet/).count();
    note(
      `${viewport.label} bookings shows rows or an in-table empty message`,
      bookingRows > 0 || genuineEmpty > 0,
      bookingRows > 0 ? `${bookingRows} rows` : 'zero records',
    );
    await search.fill('zzz-no-such-booking-p936');
    await page.getByText('No bookings match your selected filters.').waitFor({ timeout: 15000 });
    note(`${viewport.label} filtered bookings stay inside the workspace`, (await page.locator('.partner-bookings-workspace').count()) > 0 && (await page.getByRole('button', { name: 'Tours' }).count()) > 0);
    await search.fill('');

    await page.goto(`${ORIGIN}/partner/listings`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const listingSearch = page.getByPlaceholder('Search title, destination, or reference');
    await listingSearch.waitFor({ timeout: 30000 });
    note(`${viewport.label} listings keeps category filters`, (await page.getByRole('tab', { name: /Tours/ }).count()) > 0);
    note(`${viewport.label} listings keeps create control`, (await page.getByRole('button', { name: /Create listing|New listing/ }).count()) > 0);
    await page.getByText(/No listings yet|Create listing/).first().waitFor({ timeout: 20000 });
    const listingRows = await page.locator('.tv-ops-listing-row').count();
    note(
      `${viewport.label} listings shows rows or an in-content empty message`,
      listingRows > 0 || (await page.getByText('No listings yet').count()) > 0,
      listingRows > 0 ? `${listingRows} rows` : 'zero records',
    );
    await listingSearch.fill('zzz-no-such-listing-p936');
    await page.getByText('No matching listings').waitFor({ timeout: 15000 });
    note(`${viewport.label} filtered listings stay in the content area`, (await page.locator('.partner-listings-workspace').count()) > 0 && (await page.getByRole('tab', { name: /Tours/ }).count()) > 0);

    await page.goto(`${ORIGIN}/partner/inbox`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.getByLabel('Search conversations').waitFor({ timeout: 30000 });
    note(`${viewport.label} inbox shows both panels`, (await page.locator('.tv-inbox-list-pane').count()) > 0 && (await page.locator('.tv-inbox-chat').count()) > 0);
    const threads = await page.locator('.tv-inbox-list li').count();
    const inboxEmpty = await page.getByText('No conversations yet').count();
    note(
      `${viewport.label} inbox shows threads or an in-list empty message`,
      threads > 0 || inboxEmpty > 0,
      threads > 0 ? `${threads} threads` : 'zero records',
    );
    await page.getByLabel('Search conversations').fill('zzz-no-such-thread-p936');
    await page.getByText('No conversations match your search').waitFor({ timeout: 15000 });
    note(`${viewport.label} inbox search empty stays in the list`, (await page.locator('.tv-inbox-split').count()) > 0 && (await page.locator('.tv-inbox-chat').count()) > 0);
    await page.close();
  }

  const broken = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await broken.route('**/rest/v1/listings**', (route) => route.abort());
  await broken.goto(`${ORIGIN}/partner/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await broken.evaluate(
    ({ key, session }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type ?? 'bearer',
          user: session.user,
        }),
      );
    },
    { key: `sb-${PROJECT}-auth-token`, session },
  );
  await broken.goto(`${ORIGIN}/partner/bookings`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await broken.getByText('Bookings unavailable').waitFor({ timeout: 25000 });
  note('booking load errors stay distinct from the empty list', (await broken.getByText('No bookings yet').count()) === 0);
  await broken.close();
} finally {
  await browser.close();
}

const failed = checks.filter((item) => !item.ok);
const report = {
  origin: ORIGIN,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
};
writeFileSync(resolve(root, 'scripts/cert-p936-empty-layouts.json'), JSON.stringify(report, null, 2));
if (failed.length) {
  console.log(`RESULT ${report.passed}/${checks.length} FAIL`);
  process.exit(1);
}
console.log(`RESULT ${report.passed}/${checks.length} PASS`);
