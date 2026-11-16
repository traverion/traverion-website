import { readFileSync } from 'node:fs';
for (const file of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}
const secret = process.env.STRIPE_SECRET_KEY || '';
if (!secret.startsWith('sk_test_')) process.exit(1);
const res = await fetch('https://api.stripe.com/v1/accounts/acct_1UcWUMC3Batf5jGY', {
  headers: { Authorization: `Bearer ${secret}` },
});
const a = await res.json();
console.log(JSON.stringify({
  status: res.status,
  type: a.type ?? null,
  livemode: a.livemode === true,
  country: a.country ?? null,
  charges_enabled: a.charges_enabled === true,
  payouts_enabled: a.payouts_enabled === true,
  details_submitted: a.details_submitted === true,
  transfers: a.capabilities?.transfers ?? null,
  card_payments: a.capabilities?.card_payments ?? null,
  currently_due: (a.requirements?.currently_due ?? []).length,
  past_due: (a.requirements?.past_due ?? []).length,
  disabled_reason: a.requirements?.disabled_reason ?? null,
  controller_collection: a.controller?.requirement_collection ?? null,
  dashboard: a.controller?.stripe_dashboard?.type ?? null,
}));
