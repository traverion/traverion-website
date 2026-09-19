import { describe, expect, it } from 'vitest';
import { localYmd, localYmdPlusDays } from './local-ymd';

describe('localYmd', () => {
  it('formats the operator local calendar day, not UTC', () => {
    // Fixed wall-clock components — independent of machine TZ offset for this assert style.
    const d = new Date(2026, 8, 19, 23, 30, 0); // 19 Sep 2026 local
    expect(localYmd(d)).toBe('2026-09-19');
    expect(localYmdPlusDays(1, d)).toBe('2026-09-20');
  });
});
