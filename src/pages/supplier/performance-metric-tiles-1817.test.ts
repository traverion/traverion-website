import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1817: Analytics metric hierarchy', () => {
  it('defines tv-metric-tile', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('Phase 1817');
    expect(css).toContain('.tv-metric-tile');
    expect(css).toContain('.tv-metric-tile__value');
  });

  it('SupplierPerformance uses metric tiles and Analytics sections', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierPerformance.tsx'), 'utf8');
    expect(src).toContain('tv-metric-tile');
    expect(src).toContain('tv-metric-tile__value');
    expect(src).toContain('ANALYTICS_SECTIONS');
    expect(src).toContain("section === 'summary'");
    expect(src).toContain("section === 'score'");
  });
});
