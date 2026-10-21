/** Branded HTML + plain-text templates for communication notifications. */
import { escapeHtml, transactionalEmailDocument } from './transactional-html.ts';

export const COMM_FROM_DEFAULT = 'Traverion <no-reply@traverion.com>';
export const COMM_INTERNAL_TO_DEFAULT = 'info@traverion.com';
export const COMM_REPLY_INFO = 'info@traverion.com';

export type CommAttachmentEmailMeta = {
  filename: string;
  contentType: string;
  byteSize: number;
  accessUrl?: string | null;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentsBlockHtml(items: CommAttachmentEmailMeta[]): string {
  if (!items.length) return '<p style="margin:0;color:#6b7280;font-size:13px;">No attachments</p>';
  const rows = items
    .map((a) => {
      const link = a.accessUrl
        ? `<a href="${escapeHtml(a.accessUrl)}" style="color:#0b3d6e;">Download (expires)</a>`
        : 'Stored securely — open in Traverion admin to regenerate access';
      return `<tr>
  <td style="padding:8px 10px;border:1px solid #e5e7eb;font-size:13px;">${escapeHtml(a.filename)}</td>
  <td style="padding:8px 10px;border:1px solid #e5e7eb;font-size:13px;color:#6b7280;">${escapeHtml(a.contentType)} · ${escapeHtml(formatBytes(a.byteSize))}</td>
  <td style="padding:8px 10px;border:1px solid #e5e7eb;font-size:13px;">${link}</td>
</tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:12px 0;">
<tr style="background:#f9fafb;">
  <th align="left" style="padding:8px 10px;border:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">File</th>
  <th align="left" style="padding:8px 10px;border:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">Type</th>
  <th align="left" style="padding:8px 10px;border:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">Access</th>
</tr>
${rows}
</table>
<p style="margin:8px 0 0;font-size:12px;color:#6b7280;">Signed download links expire. Regenerated access is available to Traverion administrators.</p>`;
}

function attachmentsBlockText(items: CommAttachmentEmailMeta[]): string {
  if (!items.length) return 'Attachments: none';
  return [
    'Attachments:',
    ...items.map((a) => {
      const url = a.accessUrl ? ` — ${a.accessUrl}` : ' — (admin regenerate access)';
      return `- ${a.filename} (${a.contentType}, ${formatBytes(a.byteSize)})${url}`;
    }),
  ].join('\n');
}

export function communicationConfirmHtml(params: {
  headline: string;
  greetingName: string;
  intro: string;
  reference: string;
  detailsHtml: string;
  footerNote?: string;
}): string {
  const first = params.greetingName.trim().split(/\s+/)[0] || 'there';
  return transactionalEmailDocument({
    headline: params.headline,
    preheader: `${params.headline} · ${params.reference}`,
    introHtml: `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1a1f26;">Hi ${escapeHtml(first)},</p>
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1a1f26;">${escapeHtml(params.intro)}</p>`,
    bodyHtml: `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1f26;">Your reference number is <strong style="color:#0b3d6e;">${escapeHtml(params.reference)}</strong>.</p>
${params.detailsHtml}
<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#5c6570;">If you need to provide additional information, you can reply to this email.</p>`,
    ctaUrl: 'https://www.traverion.com',
    ctaLabel: 'Visit Traverion',
    footerNote: params.footerNote ?? 'The Traverion Team · info@traverion.com',
  });
}

export function communicationConfirmText(params: {
  greetingName: string;
  intro: string;
  reference: string;
  detailsLines: string[];
}): string {
  const first = params.greetingName.trim().split(/\s+/)[0] || 'there';
  return [
    `Hi ${first},`,
    '',
    params.intro,
    '',
    `Your reference number is ${params.reference}.`,
    '',
    ...params.detailsLines,
    '',
    'If you need to provide additional information, you can reply to this email.',
    '',
    'Best regards,',
    'The Traverion Team',
    'info@traverion.com',
  ].join('\n');
}

export function communicationInternalHtml(params: {
  categoryLabel: string;
  reference: string;
  submittedAt: string;
  rows: { label: string; value: string }[];
  message: string;
  attachments: CommAttachmentEmailMeta[];
}): string {
  const detailRows = params.rows
    .filter((r) => r.value.trim())
    .map(
      (r) =>
        `<tr>
  <td style="padding:8px 10px;border:1px solid #e5e7eb;font-size:13px;color:#6b7280;width:140px;vertical-align:top;">${escapeHtml(r.label)}</td>
  <td style="padding:8px 10px;border:1px solid #e5e7eb;font-size:13px;color:#111;white-space:pre-wrap;">${escapeHtml(r.value)}</td>
</tr>`,
    )
    .join('');
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f6f8;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #e5e7eb;">
<tr><td style="padding:20px 24px;border-bottom:3px solid #0b3d6e;">
  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#0b3d6e;font-weight:700;">Traverion</p>
  <h1 style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:18px;color:#111;">${escapeHtml(params.categoryLabel)}</h1>
  <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280;">Reference <strong style="color:#0b3d6e;">${escapeHtml(params.reference)}</strong> · ${escapeHtml(params.submittedAt)}</p>
</td></tr>
<tr><td style="padding:20px 24px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${detailRows}</table>
  <h2 style="margin:20px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;">Message</h2>
  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#111;white-space:pre-wrap;">${escapeHtml(params.message)}</p>
  <h2 style="margin:20px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;">Attachments</h2>
  ${attachmentsBlockHtml(params.attachments)}
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function communicationInternalText(params: {
  categoryLabel: string;
  reference: string;
  submittedAt: string;
  rows: { label: string; value: string }[];
  message: string;
  attachments: CommAttachmentEmailMeta[];
}): string {
  return [
    params.categoryLabel,
    `Reference: ${params.reference}`,
    `Submitted: ${params.submittedAt}`,
    '',
    ...params.rows.filter((r) => r.value.trim()).map((r) => `${r.label}: ${r.value}`),
    '',
    '— Message —',
    params.message,
    '',
    attachmentsBlockText(params.attachments),
  ].join('\n');
}

export { escapeHtml };
