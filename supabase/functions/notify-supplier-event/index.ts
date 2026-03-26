// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

type EventType = 'new_booking' | 'booking_cancelled' | 'new_review' | 'supplier_welcome';

type Payload = {
  supplierId: string;
  eventType: EventType;
  listingId?: string;
  listingTitle?: string;
  bookingId?: string;
  bookingDate?: string;
  guests?: number;
  guestName?: string;
  reviewRating?: number;
  reviewTitle?: string;
  /** Base site URL (no trailing slash), e.g. https://www.traverion.com — used in supplier_welcome body */
  portalBaseUrl?: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function eventSubject(payload: Payload): string {
  if (payload.eventType === 'supplier_welcome') return 'Welcome to Traverion for suppliers';
  const listing = payload.listingTitle ?? 'your listing';
  if (payload.eventType === 'new_booking') return `New booking request: ${listing}`;
  if (payload.eventType === 'booking_cancelled') return `Booking cancelled: ${listing}`;
  return `New review received: ${listing}`;
}

function eventBody(payload: Payload): string {
  if (payload.eventType === 'supplier_welcome') {
    const base = (payload.portalBaseUrl ?? 'https://www.traverion.com').replace(/\/$/, '');
    return [
      'Thanks for creating a supplier account on Traverion.',
      '',
      'Next steps:',
      '1. Complete your business profile and payout details in Settings.',
      '2. Create and publish your first listing when you are ready.',
      '',
      `Open your supplier portal: ${base}/supplier`,
      '',
      '— Traverion',
    ].join('\n');
  }
  const listing = payload.listingTitle ?? 'Listing';
  const lines = [`Event: ${payload.eventType}`, `Listing: ${listing}`];
  if (payload.bookingId) lines.push(`Booking id: ${payload.bookingId}`);
  if (payload.bookingDate) lines.push(`Date: ${payload.bookingDate}`);
  if (typeof payload.guests === 'number' && payload.guests > 0) lines.push(`Guests: ${payload.guests}`);
  if (payload.guestName) lines.push(`Guest: ${payload.guestName}`);
  if (typeof payload.reviewRating === 'number' && payload.reviewRating > 0) lines.push(`Rating: ${payload.reviewRating}/5`);
  if (payload.reviewTitle) lines.push(`Review: ${payload.reviewTitle}`);
  lines.push('');
  lines.push('Open your supplier portal to review and take action.');
  return lines.join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }
  try {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('SUPPLIER_EMAIL_FROM') ?? 'Traverion <no-reply@traverion.com>';
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!apiKey) return json({ success: false, error: 'RESEND_API_KEY not configured' }, 500);
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured' }, 500);
    }

    const payload = (await req.json()) as Payload;
    if (!payload?.supplierId || !payload?.eventType) {
      return json({ success: false, error: 'Missing supplierId/eventType' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    if (payload.eventType === 'supplier_welcome') {
      const { data: prof } = await admin
        .from('supplier_profiles')
        .select('welcome_email_sent_at')
        .eq('id', payload.supplierId)
        .maybeSingle();
      if (prof?.welcome_email_sent_at) {
        return json({ success: true, skipped: true, notified: 0 });
      }
    }

    const recipients = new Set<string>();

    const { data: teamRows } = await admin
      .from('supplier_team_members')
      .select('user_id, label')
      .eq('supplier_id', payload.supplierId);

    const userIds = new Set<string>([payload.supplierId]);
    for (const row of teamRows ?? []) {
      if (row?.user_id) userIds.add(String(row.user_id));
      const label = typeof row?.label === 'string' ? row.label.trim() : '';
      if (label.includes('@')) recipients.add(label);
    }

    for (const uid of userIds) {
      const res = await admin.auth.admin.getUserById(uid);
      const email = res.data?.user?.email?.trim();
      if (email) recipients.add(email);
    }

    if (recipients.size === 0) {
      return json({ success: false, error: 'No recipient emails found for supplier' }, 400);
    }

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [...recipients],
        subject: eventSubject(payload),
        text: eventBody(payload),
      }),
    });
    const resendJson: any = await resendResp.json();
    if (!resendResp.ok) {
      return json({ success: false, error: resendJson?.message ?? 'Resend error' }, 500);
    }

    if (payload.eventType === 'supplier_welcome') {
      const now = new Date().toISOString();
      await admin
        .from('supplier_profiles')
        .update({ welcome_email_sent_at: now, updated_at: now })
        .eq('id', payload.supplierId);
    }

    return json({
      success: true,
      providerMessageId: resendJson?.id ?? null,
      notified: recipients.size,
    });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
