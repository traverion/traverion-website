import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1824: NoticeCallout design system polish', () => {
  it('defines tv-notice tone classes', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toContain('Phase 1824');
    expect(css).toContain('.tv-notice--info');
    expect(css).toContain('.tv-notice--warn');
    expect(css).toContain('.tv-notice--danger');
    expect(css).toContain('.tv-notice--success');
  });

  it('NoticeCallout uses shared tv-notice classes', () => {
    const src = readFileSync(resolve(__dirname, 'NoticeCallout.tsx'), 'utf8');
    expect(src).toContain('tv-notice tv-notice--info');
    expect(src).toContain('[&_button]:min-h-11');
    expect(src).not.toContain('bg-finland/8 text-ink ring-1 ring-finland/15');
  });
});
