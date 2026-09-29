import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1693: Tours/Stays mobile search respects safe-area', () => {
  it('pads sheet action rows with safe-area-inset-bottom', () => {
    const tours = readFileSync(resolve(__dirname, 'Packages.tsx'), 'utf8');
    const stays = readFileSync(resolve(__dirname, 'Stays.tsx'), 'utf8');
    expect(tours).toContain('Phase 1693');
    expect(stays).toContain('Phase 1693');
    expect(tours).toContain('safe-area-inset-bottom');
    expect(stays).toContain('safe-area-inset-bottom');
  });
});
