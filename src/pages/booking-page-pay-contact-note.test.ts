import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('BookingPage checkout copy', () => {
  const src = readFileSync(join(here, 'BookingPage.tsx'), 'utf8');

  it('keeps contact details free of booking-record explanations', () => {
    expect(src).not.toContain('BOOKING_CONTACT_EMAIL_FIELD_NOTE');
    expect(src).toContain('Confirm your details so we can send your booking information.');
  });

  it('pays the verified total without a test-mode label on the button', () => {
    expect(src).toMatch(/`Pay \$\{totalLabel\}`/);
    expect(src).not.toMatch(/then pay \$\{totalLabel\} via \$\{STRIPE_TEST_UNTIL_LIVE\}/);
    expect(src).not.toContain('STRIPE_TEST_UNTIL_LIVE');
  });
});
