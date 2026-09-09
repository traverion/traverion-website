import { describe, expect, it } from 'vitest';
import { partnerTodayEmptyScheduleCopy } from './partner-today-copy';

describe('partnerTodayEmptyScheduleCopy', () => {
  it('does not claim nothing needs you when attention work exists', () => {
    const copy = partnerTodayEmptyScheduleCopy(2);
    expect(copy.title.toLowerCase()).toContain('no guests');
    expect(copy.body.toLowerCase()).toContain('still need');
    expect(copy.body.toLowerCase()).not.toContain('nothing needs you');
    expect(copy.title.toLowerCase()).not.toContain("you're set");
  });

  it('keeps calm empty copy when attention is clear', () => {
    const copy = partnerTodayEmptyScheduleCopy(0);
    expect(copy.title).toContain("You're set");
    expect(copy.body.toLowerCase()).toContain('nothing needs you');
  });
});
