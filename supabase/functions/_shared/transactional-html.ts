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
