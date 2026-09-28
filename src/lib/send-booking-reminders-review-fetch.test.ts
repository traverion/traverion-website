import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lifecycleStayCheckOutYmd } from './booking-lifecycle-calendar';

const here = dirname(fileURLToPath(import.meta.url));

describe('Review cron fetch honesty (Phase 1565)', () => {
  const cron = readFileSync(
    join(here, '../../supabase/functions/send-booking-reminders/index.ts'),
    'utf8'
  );

  it('loads nights and snapshot candidates even when check_out column is set', () => {
    expect(cron).toContain('Phase 1565');
    // Nights path must not require check_out IS NULL (stale short column + long nights).
    expect(cron).not.toMatch(
      /reviewByNights[\s\S]*?\.is\('check_out',\s*'null'\)[\s\S]*?\.gte\('nights'/
    );
    // Snapshot path must not require check_out IS NULL (stale short column + long snap).
    expect(cron).toMatch(
      /Phase 1537\/1565[\s\S]*filter\('purchase_snapshot->>checkOut'/
    );
    expect(cron).not.toMatch(
      /reviewBySnapCheckout[\s\S]*?\.is\('check_out',\s*'null'\)[\s\S]*?purchase_snapshot->>checkOut/
    );
  });

  it('Phase 1567: reviewByCheckout uses wide stay window not ±3 only', () => {
    expect(cron).toContain('Phase 1567');
    expect(cron).toMatch(
      /Phase 1567[\s\S]*\.gte\('check_out',\s*stayNightsWindow\.fromYmd\)/
    );
    expect(cron).not.toMatch(
      /not\('check_out',\s*'is',\s*null\)[\s\S]*?\.gte\('check_out',\s*fromYmd\)/
    );
  });

  it('lifecycle completion for short column + long snap is the long date', () => {
    expect(
      lifecycleStayCheckOutYmd({
        booking_date: '2026-12-01',
        check_out: '2026-12-03',
        nights: 2,
        purchase_snapshot: { checkOut: '2026-12-08' },
      })
    ).toBe('2026-12-08');
  });
});
