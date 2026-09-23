// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

// Phase 561: this endpoint had no caller-identity check at all -- any
// unauthenticated request with a JSON body was relayed verbatim to Resend
// as no-reply@traverion.com, to any recipient, with no subject/body
// restriction and no rate limit: a fully open phishing/spam relay on the
// platform's trusted sending domain. The one client-side helper that calls
// it (src/data/supabase-supplier-messaging.ts's sendSupplierEmailViaEdge)
// is not invoked from anywhere else in src/ today -- there is no live
// product flow that needs this reachable by ordinary users' anon/session
// keys. Restricting it to callers that present the project's real
// service_role key (the same key server-side functions like stripe-webhook
// already use when invoking notify-customer-booking/notify-supplier-event)
// closes the open relay while leaving room for a future legitimate
// server-to-server caller (e.g. a staff-reply RPC) to use it correctly.
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';

function isServiceRoleCaller(req: Request): boolean {
  if (!serviceRoleKey) return false;
  const auth = req.headers.get('authorization')?.trim();
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return bearer.length > 0 && bearer === serviceRoleKey;
}

type Payload = {
  to: string[];
  subject: string;
  body: string;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (!isServiceRoleCaller(req)) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('SUPPLIER_EMAIL_FROM') ?? 'Traverion <no-reply@traverion.com>';
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: 'RESEND_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const payload = (await req.json()) as Payload;
    if (!payload?.to?.length || !payload.subject || !payload.body) {
      return new Response(JSON.stringify({ success: false, error: 'Missing to/subject/body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: payload.to,
        subject: payload.subject,
        text: payload.body,
      }),
    });
    const resendJson: any = await resendResp.json();

    if (!resendResp.ok) {
      return new Response(JSON.stringify({ success: false, error: resendJson?.message ?? 'Resend error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        providerMessageId: resendJson?.id ?? null,
      }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
});

