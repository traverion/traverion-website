import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('Paid stay receipt check-out honesty (Phase 1576)', () => {
  const pdf = readFileSync(
    join(here, '../../supabase/functions/_shared/receipt-pdf.ts'),
    'utf8'
  );
  const notify = readFileSync(
    join(here, '../../supabase/functions/notify-customer-booking/index.ts'),
    'utf8'
  );

  it('PDF draws Check-in/Check-out for stays', () => {
    expect(pdf).toContain('Phase 1576');
    expect(pdf).toMatch(/Check-in: \$\{input\.bookingDate\}/);
    expect(pdf).toMatch(/Check-out: \$\{checkOut\}/);
  });

  it('notify text and PDF pass checkOutDate for stays', () => {
    expect(notify).toContain('Phase 1576');
    expect(notify).toMatch(/Check-in: \$\{bookingDate\}/);
    expect(notify).toMatch(/Check-out: \$\{checkOut\}/);
    expect(notify).toMatch(/checkOutDate,\s*\n\s*listingKind,/);
  });
});
