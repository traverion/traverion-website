import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1825: StatusChip design system polish', () => {
  it('defines tv-status-chip tones', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toContain('Phase 1825');
    expect(css).toContain('.tv-status-chip--good');
    expect(css).toContain('.tv-status-chip--warn');
    expect(css).toContain('.tv-status-chip--info');
  });

  it('StatusChip uses shared classes without changing tone logic', () => {
    const src = readFileSync(resolve(__dirname, 'StatusChip.tsx'), 'utf8');
    expect(src).toContain('tv-status-chip tv-status-chip--good');
    expect(src).toContain('toneForPaymentLabel');
    expect(src).toContain('hold expired');
    expect(src).not.toContain('bg-emerald-50 text-emerald-800 ring-emerald-200/80');
  });
});
