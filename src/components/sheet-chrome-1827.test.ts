import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1827: sheet/dialog chrome polish', () => {
  it('elevates sheet overlay and panel shadow', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toContain('Phase 1827');
    expect(css).toContain('rgba(12, 10, 9, 0.48)');
    expect(css).toContain('0 28px 64px -24px');
    expect(css).toContain('blur(10px)');
  });
});
