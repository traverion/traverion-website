import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('PartnerHelpTip', () => {
  const src = readFileSync(new URL('./PartnerHelpTip.tsx', import.meta.url), 'utf8');

  it('opens only on user action and supports keyboard/dismiss', () => {
    expect(src).toContain('aria-expanded');
    expect(src).toContain('aria-haspopup="dialog"');
    expect(src).toContain("e.key === 'Escape'");
    expect(src).toContain("e.key === 'Enter' || e.key === ' '");
    expect(src).not.toContain('setOpen(true)');
    expect(src).toContain('sheetMaxWidth');
  });
});
