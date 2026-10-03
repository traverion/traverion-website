import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Phase 1853: paid-booking side-effect notifies must use matching service-role
 * Authorization + apikey. Anon+service mix is rejected by the Supabase gateway
 * as "Conflicting API keys" — booking #44 paid with no confirmation emails.
 */
describe('Phase 1853: paid booking notify edge invoke headers', () => {
  const promoteSrc = readFileSync(
    resolve(__dirname, '../../supabase/functions/_shared/promote-paid-from-checkout.ts'),
    'utf8'
  );

  it('exports serviceRoleEdgeInvokeHeaders with matching Bearer and apikey', () => {
    expect(promoteSrc).toContain('export function serviceRoleEdgeInvokeHeaders');
    expect(promoteSrc).toMatch(
      /Authorization:\s*`Bearer \$\{key\}`[\s\S]*?apikey:\s*key/
    );
  });

  it('notifyPaidBookingSideEffects uses serviceRoleEdgeInvokeHeaders (not anon apikey)', () => {
    const fnStart = promoteSrc.indexOf('export async function notifyPaidBookingSideEffects');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const nextExport = promoteSrc.indexOf('export async function notifyTravelerCheckoutCaptureReversed');
    const body = promoteSrc.slice(fnStart, nextExport > fnStart ? nextExport : undefined);
    expect(body).toContain('serviceRoleEdgeInvokeHeaders(serviceRoleKey)');
    expect(body).not.toMatch(/apikey:\s*anon/);
    expect(body).not.toContain("Deno.env.get('SUPABASE_ANON_KEY')");
    expect(body).toContain("idempotencyKey: `supplier:new_booking:${bookingId}`");
    expect(body).toContain("idempotencyKey: `customer:booking_confirmed_paid:${bookingId}`");
  });

  it('stripe-webhook refund path already matches service-role apikey (parity)', () => {
    const webhookSrc = readFileSync(
      resolve(__dirname, '../../supabase/functions/stripe-webhook/index.ts'),
      'utf8'
    );
    expect(webhookSrc).toContain('apikey: serviceRoleKey');
    expect(webhookSrc).toContain('Authorization: `Bearer ${serviceRoleKey}`');
  });
});
