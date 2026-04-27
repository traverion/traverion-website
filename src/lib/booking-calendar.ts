/** Escape TEXT value for RFC 5545 iCalendar. */
function icsEscapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '\\n');
}

function formatIcsUtcStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Trigger download of a minimal all-day event for the experience date. */
export function downloadBookingIcs(params: {
  title: string;
  dateIso: string;
  descriptionLines: string[];
}): void {
  const date = params.dateIso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const yyyymmdd = date.replace(/-/g, '');
  const uid = `traverion-${yyyymmdd}-${Date.now()}@traverion.com`;
  const dtstamp = formatIcsUtcStamp(new Date());
  const desc = icsEscapeText(params.descriptionLines.filter(Boolean).join('\n'));
  const summary = icsEscapeText(params.title);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Traverion//Booking//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${yyyymmdd}`,
    `DTEND;VALUE=DATE:${yyyymmdd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const body = `${lines.join('\r\n')}\r\n`;
  const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `traverion-booking-${date}.ics`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
