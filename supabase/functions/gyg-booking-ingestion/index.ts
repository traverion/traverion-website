/**
 * GetYourGuide ingestion endpoint.
 * Returns before any provider call or database write while ingestion is unapproved.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { gygIngestionEnabled } from '../_shared/gyg-ingestion.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  const decision = gygIngestionEnabled({
    envFlag: Deno.env.get('GYG_INGESTION_ENABLED'),
  });
  if (!decision.enabled) {
    return json({
      success: false,
      ingestion_enabled: false,
      error: decision.reason,
    }, 503);
  }

  return json({
    success: false,
    ingestion_enabled: false,
    error: 'GetYourGuide ingestion has no approved provider client.',
  }, 503);
});
