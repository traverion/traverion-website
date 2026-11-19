/**
 * P9.53 — disposable TEST Accounts v2 certification.
 * Refuses live keys. Does not touch supplier_profiles or acct_1UdHT6C7oDQnLYSF.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const VERSION = '2026-10-28.preview';
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
    })
);
const key = env.STRIPE_SECRET_KEY || '';
if (!key.startsWith('sk_test_')) {
  console.error('REFUSED non-test Stripe key');
  process.exit(1);
}

const steps = [];
function note(name, ok, detail) {
  const safe = typeof detail === 'string' ? detail.slice(0, 240) : detail;
  steps.push({ name, ok, detail: safe ?? null });
  console.log(ok ? 'PASS' : 'FAIL', name, typeof safe === 'string' ? safe : '');
}

async function stripe(method, path, body, extraHeaders) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Stripe-Version': VERSION,
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...extraHeaders,
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text.slice(0, 180) };
  }
  if (!response.ok) {
    const err = new Error(payload?.error?.message || `HTTP ${response.status}`);
    err.code = payload?.error?.code || null;
    err.status = response.status;
    err.param = payload?.error?.param || null;
    throw err;
  }
  return payload;
}

const created = await stripe('POST', '/v2/core/accounts', {
  contact_email: 'p953-disposable@example.com',
  display_name: 'P953 Disposable Oy',
  dashboard: 'none',
  identity: { country: 'fi', entity_type: 'company' },
  defaults: {
    responsibilities: { fees_collector: 'application', losses_collector: 'application' },
    profile: {
      business_url: 'https://traverion.com',
      product_description: 'Travel experiences and stays sold on Traverion',
    },
  },
  configuration: {
    recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
  },
  metadata: { traverion_p953: 'disposable', traverion_account_api: 'v2' },
  include: ['configuration.recipient', 'defaults', 'identity', 'requirements'],
});
const accountId = created.id;
note('create test account', created.livemode === false && String(accountId).startsWith('acct_'), `livemode=${created.livemode}`);

let businessOk = false;
for (const value of ['0000000-0', '1234567-1']) {
  try {
    await stripe('POST', `/v2/core/accounts/${accountId}`, {
      identity: {
        business_details: {
          registered_name: 'P953 Disposable Oy',
          phone: '+358401234567',
          address: { line1: 'Testikatu 1', city: 'Helsinki', postal_code: '00100', country: 'fi' },
          id_numbers: [{ type: 'fi_yt', value }],
        },
      },
      include: ['requirements', 'identity'],
    });
    businessOk = true;
    note('company and finnish business id', true, 'accepted');
    break;
  } catch (err) {
    note(`company id attempt`, false, `${err.code || ''} ${err.message}`);
  }
}

const due = (account) =>
  (account?.requirements?.entries || [])
    .filter((entry) => entry?.minimum_deadline?.status === 'currently_due' || entry?.minimum_deadline?.status === 'past_due')
    .map((entry) => entry.description);

let personId = null;
try {
  const person = await stripe('POST', `/v2/core/accounts/${accountId}/persons`, {
    given_name: 'Test',
    surname: 'Representative',
    email: 'p953-person@example.com',
    phone: '+358401112233',
    date_of_birth: { day: 1, month: 1, year: 1990 },
    address: { line1: 'Testikatu 1', city: 'Helsinki', postal_code: '00100', country: 'fi' },
    relationship: {
      representative: true,
      director: true,
      executive: true,
      owner: true,
      percent_ownership: '25',
      title: 'Managing director',
    },
  });
  personId = person.id;
  note('v2 person create', Boolean(personId), person.object || 'person');
} catch (err) {
  note('v2 person create', false, `${err.param || ''} ${err.code || ''} ${err.message}`);
}

if (personId) {
  try {
    await stripe('POST', `/v2/core/accounts/${accountId}/persons/${personId}`, {
      relationship: { title: 'Director' },
    });
    note('v2 person update', true);
  } catch (err) {
    note('v2 person update', false, `${err.code || ''} ${err.message}`);
  }
}

let ownerId = null;
try {
  const owner = await stripe('POST', `/v2/core/accounts/${accountId}/persons`, {
    given_name: 'Test',
    surname: 'Owner',
    date_of_birth: { day: 2, month: 2, year: 1985 },
    address: { line1: 'Testikatu 2', city: 'Helsinki', postal_code: '00100', country: 'fi' },
    relationship: { owner: true, percent_ownership: '30', representative: false, director: false, title: 'Owner' },
  });
  ownerId = owner.id;
  note('v2 beneficial owner', Boolean(ownerId));
} catch (err) {
  note('v2 beneficial owner', false, `${err.param || ''} ${err.code || ''} ${err.message}`);
}

try {
  const attested = await stripe('POST', `/v2/core/accounts/${accountId}`, {
    identity: { attestations: { persons_provided: { directors: true, executives: true, owners: true } } },
    include: ['requirements'],
  });
  note('person attestations', true, `due=${due(attested).length}`);
} catch (err) {
  note('person attestations', false, `${err.code || ''} ${err.message}`);
}

try {
  await stripe('POST', `/v2/core/accounts/${accountId}`, {
    identity: {
      attestations: {
        terms_of_service: { account: { date: new Date().toISOString(), ip: '203.0.113.10' } },
      },
    },
    include: ['requirements'],
  });
  note('terms acceptance', true);
} catch (err) {
  note('terms acceptance', false, `${err.code || ''} ${err.message}`);
}

try {
  const params = new URLSearchParams();
  params.set('bank_account[country]', 'FI');
  params.set('bank_account[currency]', 'eur');
  params.set('bank_account[account_holder_name]', 'P953 Disposable Oy');
  params.set('bank_account[account_holder_type]', 'company');
  params.set('bank_account[account_number]', 'FI2112345600000785');
  const tokenRes = await fetch('https://api.stripe.com/v1/tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const token = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(token?.error?.message || 'token failed');
  const ext = await fetch(`https://api.stripe.com/v1/accounts/${accountId}/external_accounts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ external_account: token.id, default_for_currency: 'true' }),
  });
  const extBody = await ext.json();
  if (!ext.ok) throw new Error(`${extBody?.error?.code || ''} ${extBody?.error?.message || 'attach failed'}`);
  note('bank token attach', true, `last4=${extBody.last4 || 'set'}`);
} catch (err) {
  note('bank token attach', false, err.message);
}

if (personId) {
  try {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const form = new FormData();
    form.set('purpose', 'identity_document');
    form.set('file', new Blob([png], { type: 'image/png' }), 'id.png');
    const fileRes = await fetch('https://api.stripe.com/v1/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const file = await fileRes.json();
    if (!fileRes.ok) throw new Error(file?.error?.message || 'file failed');
    const shapes = [
      { documents: { primary_verification: { front_back: { front: file.id } } } },
      { documents: { passport: { front: file.id } } },
      { documents: { company_authorization: { files: [file.id] } } },
    ];
    let attached = false;
    for (const shape of shapes) {
      try {
        await stripe('POST', `/v2/core/accounts/${accountId}/persons/${personId}`, shape);
        attached = true;
        note('identity document attach', true, Object.keys(shape.documents)[0]);
        break;
      } catch (err) {
        note(`document shape ${Object.keys(shape.documents)[0]}`, false, `${err.param || ''} ${err.message}`);
      }
    }
    if (!attached) note('identity document attach', false, 'no accepted shape');
  } catch (err) {
    note('identity document upload', false, err.message);
  }
}

try {
  const fresh = await stripe(
    'GET',
    `/v2/core/accounts/${accountId}?include=${encodeURIComponent('requirements')}&include=${encodeURIComponent('configuration.recipient')}`
  );
  const transfers =
    fresh?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status || 'missing';
  note('requirements sync', Array.isArray(fresh?.requirements?.entries), `transfers=${transfers} due=${due(fresh).join('|') || 'none'}`);
} catch (err) {
  note('requirements sync', false, err.message);
}

const report = {
  at: new Date().toISOString(),
  mission: 'P9.53',
  account: accountId,
  livemode: false,
  businessOk,
  personId: personId ? 'created' : null,
  ownerId: ownerId ? 'created' : null,
  steps,
  verdict: steps.every((step) => step.ok || step.name.startsWith('company id attempt') || step.name.startsWith('document shape'))
    ? 'SEE_STEPS'
    : 'SEE_STEPS',
};
writeFileSync('scripts/cert-p953-v2-api.json', JSON.stringify(report, null, 2));
console.log('ACCOUNT', accountId);
