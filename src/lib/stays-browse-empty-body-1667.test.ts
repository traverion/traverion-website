import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1667: Stays empty body distinguishes text search', () => {
  it('wires staysBrowseFilteredEmptyBody into Stays empty state', () => {
    const stays = readFileSync(resolve(__dirname, '../pages/Stays.tsx'), 'utf8');
    const lib = readFileSync(resolve(__dirname, 'marketplaceBrowse.ts'), 'utf8');
    expect(lib).toContain('Phase 1667');
    expect(lib).toContain('staysBrowseFilteredEmptyBody');
    expect(stays).toContain('staysBrowseFilteredEmptyBody(q.trim() !== \'\')');
  });
});
