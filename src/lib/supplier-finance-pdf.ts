import { formatBpsAsPercent } from './commercial-money';
import { formatMinorMoney } from './supplier-income';

export type EarningsStatementInput = {
  reference: string;
  issueDate: string;
  supplierName: string | null;
  supplierAddress: string | null;
  businessId: string | null;
  vatId: string | null;
  bookingReference: string;
  experience: string;
  activityDate: string | null;
  purchaseDate: string | null;
  currency: string;
  grossMinor: number;
  commissionMinor: number;
  commissionBps: number;
  netMinor: number;
  payoutStatus: string;
};

export type PayoutStatementLine = {
  reference: string;
  experience: string;
  grossMinor: number | null;
  commissionMinor: number | null;
  commissionBps: number | null;
  netMinor: number;
};

export type PayoutStatementInput = {
  reference: string;
  issueDate: string;
  supplierName: string | null;
  currency: string;
  periodStart: string;
  periodEnd: string;
  statusLabel: string;
  paidAt: string | null;
  paymentReference?: string | null;
  lines: PayoutStatementLine[];
  totalNetMinor: number;
};

function pdfEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function pdfSafe(value: string): string {
  return pdfEscape(value.replace(/[^\x20-\x7E]/g, '?'));
}

/** One or more pages of Helvetica text. Amounts use an ISO currency code because the base font has no euro glyph. */
export function buildTextPdf(pages: string[][]): Uint8Array {
  const objects: string[] = [];
  const pageIds: number[] = [];
  let nextId = 3;
  const fontId = 3 + pages.length * 2;
  for (const lines of pages) {
    const pageId = nextId++;
    const contentId = nextId++;
    pageIds.push(pageId);
    const commands = ['BT', '/F1 10 Tf', '13 TL', '48 790 Td'];
    lines.forEach((line, index) => {
      if (index === 0) commands.push(`(${pdfSafe(line)}) Tj`);
      else commands.push(`T* (${pdfSafe(line)}) Tj`);
    });
    commands.push('ET');
    const stream = commands.join('\n');
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
  }
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[fontId] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  const maxId = fontId;
  for (let id = 1; id <= maxId; id += 1) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id] ?? '<< >>'}\nendobj\n`;
  }
  const xrefAt = body.length;
  body += `xref\n0 ${maxId + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let id = 1; id <= maxId; id += 1) {
    body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer << /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return new TextEncoder().encode(body);
}

export function earningsStatementLines(input: EarningsStatementInput): string[] {
  const rate = formatBpsAsPercent(input.commissionBps);
  return [
    'TRAVERION',
    'Supplier earnings statement',
    `Reference: ${input.reference}`,
    `Issue date: ${input.issueDate}`,
    '',
    'This statement reports the commercial split frozen on the booking record.',
    'It is not a VAT invoice. Traverion does not add tax on this statement.',
    'It is not proof that money was transferred to the supplier.',
    '',
    'Supplier',
    input.supplierName || 'Legal name not on file',
    input.supplierAddress || 'Registered address not on file',
    input.businessId ? `Business ID: ${input.businessId}` : 'Business ID: not on file',
    input.vatId ? `VAT ID: ${input.vatId}` : 'VAT ID: not on file',
    '',
    `Booking: ${input.bookingReference}`,
    `Experience: ${input.experience}`,
    `Activity date: ${input.activityDate || 'Not set'}`,
    `Purchase date: ${input.purchaseDate || 'Not set'}`,
    `Payout status: ${input.payoutStatus}`,
    '',
    `Customer booking amount: ${formatMinorMoney(input.grossMinor, input.currency)}`,
    `Traverion commission (${rate}): -${formatMinorMoney(input.commissionMinor, input.currency)}`,
    `Net supplier earnings: ${formatMinorMoney(input.netMinor, input.currency)}`,
  ];
}

export function payoutStatementLines(input: PayoutStatementInput): string[] {
  const lines = [
    'TRAVERION',
    'Supplier payout statement',
    `Reference: ${input.reference}`,
    `Issue date: ${input.issueDate}`,
    '',
    'This statement lists net booking earnings included in a confirmed payout record.',
    'It is not a VAT invoice. Tax and VAT figures are not invented on this statement.',
    input.paidAt
      ? `Payment recorded at ${input.paidAt}.`
      : 'No completion time is recorded. This is not proof of transfer.',
    input.paymentReference
      ? `Payment confirmation reference: ${input.paymentReference}`
      : 'Payment confirmation reference: not on file',
    '',
    'Supplier',
    input.supplierName || 'Legal name not on file',
    '',
    `Period: ${input.periodStart} to ${input.periodEnd}`,
    `Status: ${input.statusLabel}`,
    `Currency: ${input.currency.toUpperCase()}`,
    '',
    'Included earnings',
  ];
  if (input.lines.length === 0) {
    lines.push('Itemized bookings are not on this record.');
  }
  for (const line of input.lines) {
    lines.push(`${line.reference}  ${line.experience}`);
    if (line.grossMinor != null && line.commissionMinor != null && line.commissionBps != null) {
      lines.push(
        `  Customer booking amount ${formatMinorMoney(line.grossMinor, input.currency)}`
      );
      lines.push(
        `  Traverion commission (${formatBpsAsPercent(line.commissionBps)}) -${formatMinorMoney(line.commissionMinor, input.currency)}`
      );
    }
    lines.push(`  Net ${formatMinorMoney(line.netMinor, input.currency)}`);
  }
  lines.push('');
  lines.push(`Net amount payable to supplier: ${formatMinorMoney(input.totalNetMinor, input.currency)}`);
  return lines;
}

export function statementPdf(lines: string[]): Uint8Array {
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += 46) pages.push(lines.slice(i, i + 46));
  return buildTextPdf(pages.length > 0 ? pages : [['TRAVERION', 'Empty statement']]);
}

export function downloadPdf(filename: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function openPdf(bytes: Uint8Array): void {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
