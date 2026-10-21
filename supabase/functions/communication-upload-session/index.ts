// deno-lint-ignore-file no-explicit-any
/**
 * Create a short-lived upload session and signed upload URLs for
 * communication-attachments (private bucket). No service-role keys to client.
 *
 * Actions:
 *  - create: open session (+ optional first file slot)
 *  - sign: add another file slot to an open session
 *  - complete-file: mark uploaded after client PUT
 *  - abandon: mark session abandoned
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { adminClientFromEnv } from '../_shared/transactional-email.ts';
import {
  COMM_BUCKET,
  COMM_MAX_ATTACHMENTS,
  COMM_MAX_TOTAL_BYTES,
  COMM_SIGNED_UPLOAD_SECONDS,
  COMM_UPLOAD_SESSION_TTL_SECONDS,
  hashClientToken,
  sanitizeFilename,
  validateCommFileMeta,
} from '../_shared/communication-attachments.ts';

const CATEGORIES = new Set([
  'partner_support',
  'contact',
  'affiliate',
  'content_creator',
  'supplier',
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function cors(): Response {
  return new Response('ok', {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return cors();
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  try {
    const admin = adminClientFromEnv();
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!admin || !supabaseUrl || !anonKey) {
      return json({ success: false, error: 'Server configuration incomplete.' }, 500);
    }

    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? 'create').trim();

    // Optional auth (required for partner_support)
    let userId: string | null = null;
    let userEmail: string | null = null;
    const authHeader = req.headers.get('Authorization') ?? '';
    if (authHeader.startsWith('Bearer ')) {
      const authed = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: authData } = await authed.auth.getUser();
      if (authData?.user?.id) {
        userId = authData.user.id;
        userEmail = (authData.user.email ?? '').trim().toLowerCase() || null;
      }
    }

    if (action === 'create') {
      const category = String(body.category ?? '').trim();
      if (!CATEGORIES.has(category)) {
        return json({ success: false, error: 'Invalid upload category.' }, 400);
      }
      if (category === 'partner_support' && !userId) {
        return json({ success: false, error: 'Sign in to upload support attachments.' }, 401);
      }

      // Rate limit: max 8 open sessions per identity / hour
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      let rateQ = admin
        .from('communication_upload_sessions')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (userId) rateQ = rateQ.eq('submitter_user_id', userId);
      else if (userEmail) rateQ = rateQ.eq('submitter_email', userEmail);
      else {
        // Anonymous: soft limit by counting recent open public sessions is weak;
        // rely on finalize cooldowns + IP-less session cap of 20/hour globally for anon.
        const { count } = await admin
          .from('communication_upload_sessions')
          .select('id', { count: 'exact', head: true })
          .is('submitter_user_id', null)
          .gte('created_at', since);
        if ((count ?? 0) > 200) {
          return json({ success: false, error: 'Too many upload sessions. Try again later.' }, 429);
        }
      }
      if (userId || userEmail) {
        const { count } = await rateQ;
        if ((count ?? 0) >= 8) {
          return json({ success: false, error: 'Too many upload sessions. Try again later.' }, 429);
        }
      }

      const clientToken = randomToken();
      const tokenHash = await hashClientToken(clientToken);
      const expiresAt = new Date(Date.now() + COMM_UPLOAD_SESSION_TTL_SECONDS * 1000).toISOString();

      const { data: session, error: sessErr } = await admin
        .from('communication_upload_sessions')
        .insert({
          category,
          status: 'open',
          submitter_user_id: userId,
          submitter_email: userEmail,
          client_token_hash: tokenHash,
          max_files: COMM_MAX_ATTACHMENTS,
          max_total_bytes: COMM_MAX_TOTAL_BYTES,
          expires_at: expiresAt,
        })
        .select('id, expires_at')
        .single();

      if (sessErr || !session) {
        console.error('[communication-upload-session] create', sessErr?.message);
        return json({ success: false, error: 'Could not start upload session.' }, 500);
      }

      return json({
        success: true,
        sessionId: session.id,
        clientToken,
        expiresAt: session.expires_at,
        maxFiles: COMM_MAX_ATTACHMENTS,
        maxTotalBytes: COMM_MAX_TOTAL_BYTES,
      });
    }

    const sessionId = String(body.sessionId ?? '').trim();
    const clientToken = String(body.clientToken ?? '').trim();
    if (!sessionId || !clientToken) {
      return json({ success: false, error: 'Missing session credentials.' }, 400);
    }
    const tokenHash = await hashClientToken(clientToken);

    const { data: session, error: loadErr } = await admin
      .from('communication_upload_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();
    if (loadErr || !session) {
      return json({ success: false, error: 'Upload session not found.' }, 404);
    }
    if (session.client_token_hash !== tokenHash) {
      return json({ success: false, error: 'Invalid upload session.' }, 403);
    }
    if (session.status !== 'open') {
      return json({ success: false, error: 'Upload session is closed.' }, 409);
    }
    if (new Date(session.expires_at).getTime() < Date.now()) {
      await admin
        .from('communication_upload_sessions')
        .update({ status: 'expired' })
        .eq('id', sessionId);
      return json({ success: false, error: 'Upload session expired. Start again.' }, 410);
    }
    if (session.category === 'partner_support') {
      if (!userId || userId !== session.submitter_user_id) {
        return json({ success: false, error: 'Sign in to continue this upload.' }, 401);
      }
    }

    if (action === 'abandon') {
      await admin
        .from('communication_upload_sessions')
        .update({ status: 'abandoned' })
        .eq('id', sessionId);
      return json({ success: true });
    }

    if (action === 'sign') {
      const filename = sanitizeFilename(String(body.filename ?? 'attachment'));
      const byteSize = Number(body.byteSize ?? 0);
      const declaredType = String(body.contentType ?? body.mimeType ?? '').trim().toLowerCase();
      const meta = validateCommFileMeta({ name: filename, size: byteSize, type: declaredType || undefined });
      if (!meta.ok) return json({ success: false, error: meta.error }, 400);

      const { data: existing } = await admin
        .from('communication_attachments')
        .select('id, byte_size')
        .eq('session_id', sessionId)
        .neq('status', 'deleted');
      const files = existing ?? [];
      if (files.length >= COMM_MAX_ATTACHMENTS) {
        return json({ success: false, error: `Attach at most ${COMM_MAX_ATTACHMENTS} files.` }, 400);
      }
      const total = files.reduce((s: number, r: any) => s + Number(r.byte_size ?? 0), 0) + byteSize;
      if (total > COMM_MAX_TOTAL_BYTES) {
        return json({ success: false, error: 'Combined attachments exceed the size limit.' }, 400);
      }

      const attachmentId = crypto.randomUUID();
      const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
      const storagePath = `${session.category}/${sessionId}/${attachmentId}${ext}`;

      const { data: signed, error: signErr } = await admin.storage
        .from(COMM_BUCKET)
        .createSignedUploadUrl(storagePath);

      if (signErr || !signed?.signedUrl) {
        console.error('[communication-upload-session] sign', signErr?.message);
        return json({ success: false, error: 'Could not authorize upload.' }, 500);
      }

      const { error: insErr } = await admin.from('communication_attachments').insert({
        id: attachmentId,
        session_id: sessionId,
        storage_path: storagePath,
        original_filename: filename,
        content_type: meta.mime,
        byte_size: byteSize,
        kind: meta.kind,
        status: 'pending',
      });
      if (insErr) {
        console.error('[communication-upload-session] insert attachment', insErr.message);
        return json({ success: false, error: 'Could not reserve attachment slot.' }, 500);
      }

      return json({
        success: true,
        attachmentId,
        storagePath,
        contentType: meta.mime,
        kind: meta.kind,
        uploadUrl: signed.signedUrl,
        token: signed.token ?? null,
        expiresInSeconds: COMM_SIGNED_UPLOAD_SECONDS,
      });
    }

    if (action === 'complete-file') {
      const attachmentId = String(body.attachmentId ?? '').trim();
      if (!attachmentId) return json({ success: false, error: 'attachmentId required' }, 400);

      const { data: att } = await admin
        .from('communication_attachments')
        .select('*')
        .eq('id', attachmentId)
        .eq('session_id', sessionId)
        .maybeSingle();
      if (!att) return json({ success: false, error: 'Attachment not found.' }, 404);

      // Verify object exists in storage
      const { data: blob, error: dlErr } = await admin.storage
        .from(COMM_BUCKET)
        .download(att.storage_path);
      if (dlErr || !blob) {
        return json({ success: false, error: 'Upload not found in storage yet.' }, 400);
      }
      if (blob.size > Number(att.byte_size) * 1.05 + 1024) {
        await admin.storage.from(COMM_BUCKET).remove([att.storage_path]);
        await admin.from('communication_attachments').update({ status: 'deleted' }).eq('id', attachmentId);
        return json({ success: false, error: 'Uploaded file exceeds declared size.' }, 400);
      }

      await admin
        .from('communication_attachments')
        .update({ status: 'uploaded', byte_size: blob.size })
        .eq('id', attachmentId);

      return json({
        success: true,
        attachmentId,
        filename: att.original_filename,
        contentType: att.content_type,
        byteSize: blob.size,
        kind: att.kind,
      });
    }

    return json({ success: false, error: 'Unknown action.' }, 400);
  } catch (e) {
    console.error('[communication-upload-session]', e);
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
