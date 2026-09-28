import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1658: Affiliate audience field char hint', () => {
  it('shows Up to 5000 characters with live used count', () => {
    const src = readFileSync(resolve(__dirname, 'AffiliatePage.tsx'), 'utf8');
    expect(src).toContain('Phase 1658');
    expect(src).toContain('Up to 5000 characters');
    expect(src).toContain('aff-message-hint');
  });
});
