/** Shared HTML helpers for Resend transactional emails (Edge Functions). */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type FieldDiff = { label: string; before: string; after: string };

/** Traverion premium dark email tokens — keep inline for client compatibility. */
export const EMAIL_THEME = {
  pageBg: '#101318',
  cardBg: '#1C222C',
  text: '#FFFFFF',
  muted: '#AEB8C8',
  faint: '#7E8898',
  accent: '#3D8BFF',
  accentDeep: '#0b3a82',
  divider: '#2A3340',
  logoPlate: '#FFFFFF',
  success: '#34D399',
} as const;

const FONT = 'Arial,Helvetica,sans-serif';
const LOGO = 'https://www.traverion.com/traverionlogotransparent.png?v=5';

export function emailDetailRow(label: string, value: string): string {
  if (!value.trim()) return '';
  return `<tr>
  <td style="padding:8px 0;font-family:${FONT};font-size:12px;line-height:1.4;color:${EMAIL_THEME.muted};width:132px;vertical-align:top;">${escapeHtml(label)}</td>
  <td style="padding:8px 0;font-family:${FONT};font-size:14px;line-height:1.45;color:${EMAIL_THEME.text};font-weight:600;vertical-align:top;word-break:break-word;">${escapeHtml(value)}</td>
</tr>`;
}

export function emailProductBlock(params: {
  title: string;
  option?: string;
  imageUrl?: string | null;
}): string {
  const title = params.title.trim();
  if (!title) return '';
  const option = (params.option ?? '').trim();
  const image = (params.imageUrl ?? '').trim();
  const imgCell = image
    ? `<td width="88" valign="top" style="padding:0 14px 0 0;">
  <img src="${escapeHtml(image)}" width="88" height="66" alt="" style="display:block;width:88px;height:66px;object-fit:cover;border-radius:8px;border:0;"/>
</td>`
    : '';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 14px;">
<tr>
${imgCell}
<td valign="middle" style="font-family:${FONT};">
  <p style="margin:0;font-size:16px;line-height:1.3;font-weight:700;color:${EMAIL_THEME.text};">${escapeHtml(title)}</p>
  ${option ? `<p style="margin:4px 0 0;font-size:13px;line-height:1.4;color:${EMAIL_THEME.muted};">${escapeHtml(option)}</p>` : ''}
</td>
</tr>
</table>`;
}

export function emailAmountBlock(params: { label: string; amountLine: string; status?: string }): string {
  const status = (params.status ?? '').trim();
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:14px 0 0;border-top:1px solid ${EMAIL_THEME.divider};">
<tr><td style="padding-top:12px;font-family:${FONT};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${EMAIL_THEME.faint};">${escapeHtml(params.label)}</td></tr>
<tr><td style="font-family:${FONT};font-size:22px;font-weight:700;color:${EMAIL_THEME.text};padding-top:4px;">${escapeHtml(params.amountLine)}</td></tr>
${status ? `<tr><td style="font-family:${FONT};font-size:13px;color:${EMAIL_THEME.success};padding-top:4px;">${escapeHtml(status)}</td></tr>` : ''}
</table>`;
}

export function fieldDiffTableHtml(diffs: FieldDiff[]): string {
  if (!diffs.length) return '';
  const rows = diffs
    .map(
      (d) =>
        `<tr>
  <td style="padding:10px 12px;border:1px solid ${EMAIL_THEME.divider};font-size:13px;color:${EMAIL_THEME.muted};font-weight:600;vertical-align:top;">${escapeHtml(d.label)}</td>
  <td style="padding:10px 12px;border:1px solid ${EMAIL_THEME.divider};font-size:13px;color:${EMAIL_THEME.faint};vertical-align:top;white-space:pre-wrap;">${escapeHtml(d.before)}</td>
  <td style="padding:10px 12px;border:1px solid ${EMAIL_THEME.divider};font-size:13px;color:${EMAIL_THEME.text};vertical-align:top;white-space:pre-wrap;font-weight:500;">${escapeHtml(d.after)}</td>
</tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:16px 0;">
<tr style="background:#151a22;">
  <th align="left" style="padding:8px 12px;border:1px solid ${EMAIL_THEME.divider};font-size:11px;color:${EMAIL_THEME.faint};text-transform:uppercase;letter-spacing:0.04em;">Detail</th>
  <th align="left" style="padding:8px 12px;border:1px solid ${EMAIL_THEME.divider};font-size:11px;color:${EMAIL_THEME.faint};text-transform:uppercase;letter-spacing:0.04em;">Previous</th>
  <th align="left" style="padding:8px 12px;border:1px solid ${EMAIL_THEME.divider};font-size:11px;color:${EMAIL_THEME.faint};text-transform:uppercase;letter-spacing:0.04em;">Updated to</th>
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

/**
 * Premium dark Traverion shell for customer and supplier transactional mail.
 * Uses table layout + inline CSS. Logo sits on a white plate for readability.
 */
export function transactionalEmailDocument(params: {
  headline: string;
  introHtml: string;
  bodyHtml: string;
  ctaUrl: string;
  ctaLabel: string;
  preheader?: string;
  footerNote?: string;
  siteUrl?: string;
  /** Optional success / status chip under the headline. */
  statusChip?: string;
}): string {
  const site = (params.siteUrl ?? 'https://www.traverion.com').replace(/\/$/, '');
  const preheader = params.preheader ?? params.headline;
  const note = params.footerNote
    ? `<p style="margin:16px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${EMAIL_THEME.muted};">${escapeHtml(params.footerNote)}</p>`
    : '';
  const chip = (params.statusChip ?? '').trim()
    ? `<p style="margin:10px 0 0;"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(52,211,153,0.16);font-family:${FONT};font-size:12px;font-weight:700;color:${EMAIL_THEME.success};">${escapeHtml(params.statusChip!.trim())}</span></p>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="dark light"/>
<meta name="supported-color-schemes" content="dark light"/>
<title>${escapeHtml(params.headline)}</title>
<style type="text/css">
:root { color-scheme: dark light; supported-color-schemes: dark light; }
@media (prefers-color-scheme: light) {
  .tv-email-page { background-color: #101318 !important; }
  .tv-email-card { background-color: #1C222C !important; }
  .tv-email-text { color: #FFFFFF !important; }
  .tv-email-muted { color: #AEB8C8 !important; }
}
</style>
</head>
<body class="tv-email-page" style="margin:0;padding:0;background:${EMAIL_THEME.pageBg};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
<table role="presentation" class="tv-email-page" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_THEME.pageBg};">
<tr><td align="center" style="padding:20px 12px;">
<table role="presentation" class="tv-email-card" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:${EMAIL_THEME.cardBg};border:1px solid ${EMAIL_THEME.divider};border-radius:12px;">
<tr><td style="padding:18px 24px 8px;">
  <table role="presentation" cellspacing="0" cellpadding="0">
  <tr>
    <td style="background:${EMAIL_THEME.logoPlate};border-radius:8px;padding:6px 8px;vertical-align:middle;">
      <img src="${LOGO}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border:0;"/>
    </td>
    <td style="padding-left:12px;vertical-align:middle;font-family:${FONT};font-size:18px;font-weight:700;letter-spacing:0.04em;color:${EMAIL_THEME.text};">TRAVERION</td>
  </tr>
  </table>
</td></tr>
<tr><td class="tv-email-text" style="padding:10px 24px 0;font-family:${FONT};font-size:22px;line-height:1.25;font-weight:700;color:${EMAIL_THEME.text};">${escapeHtml(params.headline)}</td></tr>
${chip ? `<tr><td style="padding:0 24px;">${chip}</td></tr>` : ''}
<tr><td class="tv-email-muted" style="padding:10px 24px 0;font-family:${FONT};font-size:15px;line-height:1.55;color:${EMAIL_THEME.muted};">${params.introHtml}</td></tr>
<tr><td style="padding:16px 24px 0;">${params.bodyHtml}</td></tr>
<tr><td style="padding:8px 24px 24px;">
${note}
<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:18px;"><tr>
<td bgcolor="${EMAIL_THEME.accentDeep}" style="border-radius:8px;background:${EMAIL_THEME.accentDeep};">
<a href="${params.ctaUrl}" style="display:inline-block;padding:12px 18px;font-family:${FONT};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(params.ctaLabel)}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:14px 24px 18px;border-top:1px solid ${EMAIL_THEME.divider};font-family:${FONT};font-size:12px;line-height:1.5;color:${EMAIL_THEME.faint};">
<a href="${site}/contact" style="color:${EMAIL_THEME.accent};text-decoration:none;">Contact support</a>
<span style="color:${EMAIL_THEME.divider};"> · </span>
<a href="${site}" style="color:${EMAIL_THEME.accent};text-decoration:none;">traverion.com</a>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
