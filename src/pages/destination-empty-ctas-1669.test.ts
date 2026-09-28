import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1669: Destination empty CTAs match destinations', () => {
  it('labels onBack as Back to home and offers Browse tours/stays', () => {
    const src = readFileSync(resolve(__dirname, 'DestinationPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1669');
    expect(src).toContain('Back to home');
    expect(src).toContain("onNavigate('packages')");
    expect(src).toContain('Browse tours');
    expect(src).not.toContain('Browse tours and stays');
  });
});
