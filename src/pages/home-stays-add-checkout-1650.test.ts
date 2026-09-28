import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1650: Home stays search Add checkout chip', () => {
  it('nudges Add checkout when check-in is set without checkout', () => {
    const src = readFileSync(resolve(__dirname, 'Home.tsx'), 'utf8');
    expect(src).toContain('Phase 1650');
    expect(src).toContain('Add checkout');
    expect(src).toMatch(/else if \(when\) whenLabel = `\$\{when\} · Add checkout`/);
  });
});
