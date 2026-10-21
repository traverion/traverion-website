import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Reviews empty state stays on Reviews', () => {
  it('shows No reviews yet without New listing / Your listings CTAs', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierReviews.tsx'), 'utf8');
    expect(src).toContain('No reviews yet');
    expect(src).toContain(
      'Your guest reviews will appear here once customers start sharing their experiences.'
    );
    expect(src).not.toContain('New listing');
    expect(src).not.toContain('Your listings');
    expect(src).not.toContain('PARTNER_CREATE_PATH');
  });
});
