/**
 * Dormant ingestion endpoint.
 * Unapproved callers receive a generic not-found response. No provider is contacted.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { gygIngestionEnabled } from '../_shared/gyg-ingestion.ts';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

serve((req) => {
  if (req.method !== 'POST') return json({ error: 'Not found' }, 404);

  const decision = gygIngestionEnabled({
    envFlag: Deno.env.get('GYG_INGESTION_ENABLED'),
  });
  if (!decision.enabled) return json({ error: 'Not found' }, 404);

  return json({ error: 'Not found' }, 404);
});
