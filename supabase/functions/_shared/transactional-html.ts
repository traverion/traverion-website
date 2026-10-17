/** Shared HTML helpers for Resend transactional emails (Edge Functions). */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type FieldDiff = { label: string; before: string; after: string };

export function fieldDiffTableHtml(diffs: FieldDiff[]): string {
  if (!diffs.length) return '';
  const rows = diffs
    .map(
      (d) =>
        `<tr>
  <td style="padding:10px 12px;border:1px solid #e5e7eb;font-size:13px;color:#374151;font-weight:600;vertical-align:top;">${escapeHtml(d.label)}</td>
  <td style="padding:10px 12px;border:1px solid #e5e7eb;font-size:13px;color:#6b7280;vertical-align:top;white-space:pre-wrap;">${escapeHtml(d.before)}</td>
  <td style="padding:10px 12px;border:1px solid #e5e7eb;font-size:13px;color:#111827;vertical-align:top;white-space:pre-wrap;font-weight:500;">${escapeHtml(d.after)}</td>
</tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:16px 0;">
<tr style="background:#f9fafb;">
  <th align="left" style="padding:8px 12px;border:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Detail</th>
  <th align="left" style="padding:8px 12px;border:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Previous</th>
  <th align="left" style="padding:8px 12px;border:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Updated to</th>
</tr>
${rows}
</table>`;
}

export function fieldDiffPlainText(diffs: FieldDiff[]): string {
  if (!diffs.length) return '';
  return diffs
    .map((d) => `${d.label}\n  Previous: ${d.before}\n  Updated to: ${d.after}`)
    .join('\n\n');
}

/** City label from an IANA zone. Calculations stay on the real zone. */
export function travelerTimeLabel(startTimeHm: string, timezone: string): string {
  const hm = startTimeHm.trim();
  if (!hm) return '';
  const tz = timezone.trim();
  if (!tz) return hm;
  const city = (tz.split('/').pop() ?? tz).replace(/_/g, ' ');
  return `${hm} · ${city} time`;
}

const LOGO = 'https://www.traverion.com/traverionlogotransparent.png?v=4';

/** Table layout shared by customer and supplier transactional mail. */
export function transactionalEmailDocument(params: {
  headline: string;
  introHtml: string;
  bodyHtml: string;
  ctaUrl: string;
  ctaLabel: string;
  preheader?: string;
  footerNote?: string;
  siteUrl?: string;
}): string {
  const site = (params.siteUrl ?? 'https://www.traverion.com').replace(/\/$/, '');
  const preheader = params.preheader ?? params.headline;
  const note = params.footerNote
    ? `<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#5c6570;">${escapeHtml(params.footerNote)}</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light"/>
<title>${escapeHtml(params.headline)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;">
<tr><td align="center" style="padding:20px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e6e8ec;border-radius:8px;">
<tr><td style="padding:20px 28px 4px;">
<img src="${LOGO}" width="108" alt="Traverion" style="display:block;width:108px;max-width:108px;height:auto;border:0;"/>
</td></tr>
<tr><td style="padding:12px 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.25;font-weight:700;color:#0b1f44;">${escapeHtml(params.headline)}</td></tr>
<tr><td style="padding:8px 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#3d4450;">${params.introHtml}</td></tr>
<tr><td style="padding:16px 28px 0;">${params.bodyHtml}</td></tr>
<tr><td style="padding:8px 28px 24px;">
${note}
<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:18px;"><tr>
<td bgcolor="#0b3a82" style="border-radius:6px;background:#0b3a82;">
<a href="${params.ctaUrl}" style="display:inline-block;padding:12px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(params.ctaLabel)}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:14px 28px 18px;border-top:1px solid #e6e8ec;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7280;">
<a href="${site}/contact" style="color:#0b3a82;text-decoration:none;">Contact support</a><br/>
Traverion · <a href="${site}" style="color:#0b3a82;text-decoration:none;">traverion.com</a>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
