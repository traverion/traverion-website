#!/usr/bin/env node
/**
 * Regenerates public/sitemap.xml from published traveler inventory.
 * Uses the anon key + RLS (published listings only). Safe for prebuild.
 *
 * Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (or SUPABASE_URL / SUPABASE_ANON_KEY).
 * On missing env or fetch failure: exit 0 and leave existing sitemap (do not break deploys).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { buildSitemapEntries, renderSitemapXml } from '../src/lib/sitemap-xml.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outPath = resolve(root, 'public/sitemap.xml');

function loadEnvFile(name: string) {
  const p = resolve(root, name);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const anon = (
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ''
).trim();

if (!url || !anon) {
  console.warn('[generate-sitemap] Missing Supabase URL/anon key — keeping existing sitemap.xml');
  process.exit(0);
}

const supabase = createClient(url, anon, { auth: { persistSession: false } });

const { data, error } = await supabase
  .from('listings')
  .select('id, status, listing_extras')
  .eq('status', 'published')
  .limit(2000);

if (error) {
  console.warn('[generate-sitemap] Fetch failed — keeping existing sitemap.xml:', error.message);
  process.exit(0);
}

const rows = (data ?? []).map((r) => ({
  id: String(r.id),
  status: r.status as string | null,
  listing_extras: r.listing_extras,
}));

const xml = renderSitemapXml(buildSitemapEntries(rows));
writeFileSync(outPath, xml, 'utf8');
console.log(`[generate-sitemap] Wrote ${outPath} (${rows.length} published listing row(s))`);
