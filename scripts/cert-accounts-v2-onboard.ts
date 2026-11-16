/**
 * Onboarding updates against the single P9.6 TEST v2 account.
 * Does not create another account.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNTS_V2_STRIPE_VERSION, V2_RETRIEVE_INCLUDE } from '../src/lib/accounts-v2-config.ts';

const ACCOUNT_ID = 'acct_1UcWUMC3Batf5jGY';

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    try {
      const raw = readFileSync(resolve(process.cwd(), file), 'utf8');
      for (const line of raw.split('\n')) {
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
}
loadEnv();
const secret = (process.env.STRIPE_SECRET_KEY || '').trim();
if (!secret.startsWith('sk_test_')) {
  console.error('Refusing non-TEST secret');
  process.exit(1);
}

async function stripe(version: string, method: string, path: string, body?: unknown, form = false) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
    'Stripe-Version': version,
  };
  let payload: string | undefined;
  if (body && form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(flatten(body)).toString();
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`https://api.stripe.com${path}`, { method, headers, body: payload });
  const json = await response.json();
  return { status: response.status, json };
}

function flatten(obj: unknown, prefix = '', out: Record<string, string> = {}) {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}[${k}]` : k, out);
    }
    return out;
  }
  if (obj != null) out[prefix] = String(obj);
  return out;
}

const include = V2_RETRIEVE_INCLUDE.map((item) => `include=${encodeURIComponent(item)}`).join('&');
const before = await stripe(ACCOUNTS_V2_STRIPE_VERSION, 'GET', `/v2/core/accounts/${ACCOUNT_ID}?${include}`);
if (before.json.livemode === true) {
  console.error('Refusing livemode account');
  process.exit(1);
}
if (before.json.id !== ACCOUNT_ID) {
  console.error('Unexpected account');
  process.exit(1);
}

const steps: Array<{ id: string; status: number; error: string | null }> = [];

const business = await stripe(ACCOUNTS_V2_STRIPE_VERSION, 'POST', `/v2/core/accounts/${ACCOUNT_ID}`, {
  display_name: 'Traverion P96 disposable',
  defaults: { profile: { business_url: 'https://traverion.com', product_description: 'Travel experiences and stays sold on Traverion' } },
  identity: {
    country: 'fi',
    entity_type: 'company',
    business_details: {
      registered_name: 'Traverion P96 disposable',
      phone: '+358401234567',
      address: {
        line1: 'Mannerheimintie 1',
        city: 'Helsinki',
        postal_code: '00100',
        country: 'fi',
      },
      id_numbers: [{ type: 'fi_yt', value: '0000000-0' }],
    },
  },
  include: [...V2_RETRIEVE_INCLUDE],
});
steps.push({ id: 'business', status: business.status, error: business.json.error?.message ?? null });

const person = await stripe('2024-06-20', 'POST', `/v1/accounts/${ACCOUNT_ID}/persons`, {
  first_name: 'Aino',
  last_name: 'Testi',
  email: 'p96-v2-cert@partner-demo.traverion.invalid',
  phone: '+358401234567',
  dob: { day: 15, month: 6, year: 1990 },
  address: {
    line1: 'Mannerheimintie 1',
    city: 'Helsinki',
    postal_code: '00100',
    country: 'FI',
  },
  relationship: {
    representative: true,
    executive: true,
    director: true,
    owner: true,
    percent_ownership: 100,
    title: 'Director',
  },
}, true);
steps.push({ id: 'person_v1', status: person.status, error: person.json.error?.message ?? null });

const tos = await stripe(ACCOUNTS_V2_STRIPE_VERSION, 'POST', `/v2/core/accounts/${ACCOUNT_ID}`, {
  identity: {
    attestations: {
      terms_of_service: {
        account: { date: new Date().toISOString(), ip: '127.0.0.1' },
      },
      persons_provided: { directors: true, executives: true, owners: true },
    },
  },
  include: [...V2_RETRIEVE_INCLUDE],
});
steps.push({ id: 'tos', status: tos.status, error: tos.json.error?.message ?? null });

const token = await stripe('2024-06-20', 'POST', '/v1/tokens', {
  bank_account: {
    country: 'FI',
    currency: 'eur',
    account_holder_name: 'Traverion P96 disposable',
    account_holder_type: 'company',
    account_number: 'FI2112345600000785',
  },
}, true);
steps.push({ id: 'bank_token', status: token.status, error: token.json.error?.message ?? null });
let bankStatus: number | null = null;
let bankError: string | null = null;
if (token.json.id) {
  const bank = await stripe('2024-06-20', 'POST', `/v1/accounts/${ACCOUNT_ID}/external_accounts`, {
    external_account: token.json.id,
    default_for_currency: true,
  }, true);
  bankStatus = bank.status;
  bankError = bank.json.error?.message ?? null;
}
steps.push({ id: 'bank_attach', status: bankStatus ?? 0, error: bankError });

const after = await stripe(ACCOUNTS_V2_STRIPE_VERSION, 'GET', `/v2/core/accounts/${ACCOUNT_ID}?${include}`);
const entries = (after.json.requirements?.entries ?? []) as Array<{ description?: string; minimum_deadline?: { status?: string } }>;
const past = entries.filter((e) => e.minimum_deadline?.status === 'past_due').map((e) => e.description);
const transfers = after.json.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ?? null;
const report = {
  account_id: ACCOUNT_ID,
  livemode: after.json.livemode === true,
  metadata_api: after.json.metadata?.traverion_account_api ?? null,
  steps,
  stripe_transfers_status: transfers,
  past_due: past,
  verified: transfers === 'active',
};
writeFileSync(resolve(process.cwd(), '.tmp/p96-accounts-v2/onboard.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
