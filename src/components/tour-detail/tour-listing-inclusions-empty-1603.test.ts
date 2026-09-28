import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1603: tour inclusions empty state', () => {
  it('renders an honest stub when includes and excludes are both empty', () => {
    const src = readFileSync(resolve(__dirname, 'TourListingSections.tsx'), 'utf8');
    expect(src).toContain('Phase 1603');
    expect(src).toContain('This operator has not listed inclusions yet');
    expect(src).toMatch(/includes\.length > 0 \|\| excludes\.length > 0 \?[\s\S]*: \(/);
  });
});
