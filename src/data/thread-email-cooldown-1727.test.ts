import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1727: distinct thread/note emails are not entity-cooldown blocked', () => {
  it('notify-customer-booking does not attach 900s cooldown on message/note kinds', () => {
    const edge = readFileSync(
      resolve(__dirname, '../../supabase/functions/notify-customer-booking/index.ts'),
      'utf8'
    );
    expect(edge).toContain('Phase 1727');
    expect(edge).not.toMatch(
      /cooldownSeconds:\s*kind === 'new_booking_message' \|\| kind === 'your_details_updated' \? 900/
    );
  });

  it('notify-supplier-event does not attach 900s cooldown on guest_message / booking_detail_changed', () => {
    const edge = readFileSync(
      resolve(__dirname, '../../supabase/functions/notify-supplier-event/index.ts'),
      'utf8'
    );
    expect(edge).toContain('Phase 1727');
    expect(edge).not.toMatch(
      /cooldownSeconds:[\s\S]{0,120}guest_message[\s\S]{0,80}900/
    );
  });

  it('contact inquiry still uses entity cooldown (spam gate)', () => {
    const edge = readFileSync(
      resolve(__dirname, '../../supabase/functions/notify-contact-inquiry/index.ts'),
      'utf8'
    );
    expect(edge).toContain('cooldownSeconds: 900');
  });
});
