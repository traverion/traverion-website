// deno-lint-ignore-file no-explicit-any
/**
 * Regenerate short-lived signed download URLs for communication attachments.
 * Authorized for: Traverion staff (service-role invoke from admin tools) OR
 * the authenticated supplier who owns a partner_support submission.
 *
 * Public visitors cannot list or download arbitrary attachments.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { adminClientFromEnv } from '../_shared/transactional-email.ts';
import {
  COMM_BUCKET,
  COMM_SIGNED_DOWNLOAD_SECONDS,
} from '../_shared/communication-attachments.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
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
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  try {
    const admin = adminClientFromEnv();
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!admin || !supabaseUrl || !anonKey) {
      return json({ success: false, error: 'Server configuration incomplete.' }, 500);
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ success: false, error: 'Sign in required.' }, 401);
    }

    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await authed.auth.getUser();
    const user = authData?.user;
    if (authError || !user?.id) {
      return json({ success: false, error: 'Sign in required.' }, 401);
    }

    const body = (await req.json()) as Record<string, unknown>;
    const attachmentId = String(body.attachmentId ?? '').trim();
    const referenceCode = String(body.referenceCode ?? body.reference ?? '').trim();
    if (!attachmentId && !referenceCode) {
      return json({ success: false, error: 'attachmentId or referenceCode required' }, 400);
    }

    // Staff: admin_users / is_admin style — check supplier_profiles.is_platform_admin if present,
    // else allow only attachment ownership via partner_support submitter.
    let isStaff = false;
    const { data: adminRow } = await admin
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (adminRow?.user_id) isStaff = true;

    let attachments: any[] = [];
    if (attachmentId) {
      const { data } = await admin
        .from('communication_attachments')
        .select('*')
        .eq('id', attachmentId)
        .neq('status', 'deleted')
        .maybeSingle();
      if (data) attachments = [data];
    } else {
      // By support / contact reference
      const { data: support } = await admin
        .from('partner_support_requests')
        .select('id, submitter_user_id, supplier_id')
        .eq('reference_code', referenceCode)
        .maybeSingle();
      if (support) {
        if (!isStaff && support.submitter_user_id !== user.id && support.supplier_id !== user.id) {
          return json({ success: false, error: 'Not authorized.' }, 403);
        }
        const { data } = await admin
          .from('communication_attachments')
          .select('*')
          .eq('submission_kind', 'partner_support')
          .eq('submission_id', support.id)
          .neq('status', 'deleted');
        attachments = data ?? [];
      } else {
        const { data: inquiry } = await admin
          .from('contact_inquiries')
          .select('id')
          .eq('reference_code', referenceCode)
          .maybeSingle();
        if (!inquiry) return json({ success: false, error: 'Not found.' }, 404);
        if (!isStaff) return json({ success: false, error: 'Not authorized.' }, 403);
        const { data } = await admin
          .from('communication_attachments')
          .select('*')
          .eq('submission_kind', 'contact_inquiry')
          .eq('submission_id', inquiry.id)
          .neq('status', 'deleted');
        attachments = data ?? [];
      }
    }

    if (!attachments.length) return json({ success: false, error: 'Attachment not found.' }, 404);

    // Single attachment ownership check when not staff
    if (!isStaff && attachmentId) {
      const att = attachments[0];
      if (att.submission_kind === 'partner_support' && att.submission_id) {
        const { data: support } = await admin
          .from('partner_support_requests')
          .select('submitter_user_id, supplier_id')
          .eq('id', att.submission_id)
          .maybeSingle();
        if (
          !support ||
          (support.submitter_user_id !== user.id && support.supplier_id !== user.id)
        ) {
          return json({ success: false, error: 'Not authorized.' }, 403);
        }
      } else {
        return json({ success: false, error: 'Not authorized.' }, 403);
      }
    }

    const expiresIn = Math.min(
      Number(body.expiresInSeconds ?? COMM_SIGNED_DOWNLOAD_SECONDS) || COMM_SIGNED_DOWNLOAD_SECONDS,
      COMM_SIGNED_DOWNLOAD_SECONDS
    );

    const urls: { attachmentId: string; filename: string; url: string; expiresInSeconds: number }[] =
      [];
    for (const att of attachments) {
      const { data: signed, error } = await admin.storage
        .from(COMM_BUCKET)
        .createSignedUrl(att.storage_path, expiresIn);
      if (error || !signed?.signedUrl) {
        console.error('[communication-attachment-access]', error?.message);
        continue;
      }
      urls.push({
        attachmentId: att.id,
        filename: att.original_filename,
        url: signed.signedUrl,
        expiresInSeconds: expiresIn,
      });
    }

    if (!urls.length) return json({ success: false, error: 'Could not create download links.' }, 500);
    return json({ success: true, urls });
  } catch (e) {
    console.error('[communication-attachment-access]', e);
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
