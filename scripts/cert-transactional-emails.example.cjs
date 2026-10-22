/**
 * Example harness for Traverion transactional email certification (Stripe TEST / staging only).
 *
 * Copy to a gitignored file and supply secrets via env — never hardcode keys:
 *   cp scripts/cert-transactional-emails.example.cjs scripts/cert-transactional-emails.cjs
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... VITE_SUPABASE_ANON_KEY=... node scripts/cert-transactional-emails.cjs
 *
 * scripts/cert-transactional-emails.cjs is gitignored.
 */
const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!url || !serviceKey || !anonKey) {
  console.error(
    'Refusing to run. Set SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, and VITE_SUPABASE_ANON_KEY.'
  );
  process.exit(1);
}
if (serviceKey.startsWith('eyJ') && !process.env.ALLOW_EMAIL_CERT_RUN) {
  console.error('Refusing to run without ALLOW_EMAIL_CERT_RUN=1 (service-role invoke).');
  process.exit(1);
}

console.log('Email cert example loaded (implement invoke body in your private copy).');
console.log('Target host:', (() => { try { return new URL(url).host; } catch { return '(invalid url)'; } })());
