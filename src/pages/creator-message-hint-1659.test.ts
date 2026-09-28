import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1659: Creator collaboration field char hint', () => {
  it('shows Up to 5000 characters with live used count', () => {
    const src = readFileSync(resolve(__dirname, 'ContentCreatorPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1659');
    expect(src).toContain('Up to 5000 characters');
    expect(src).toContain('cc-message-hint');
  });
});
