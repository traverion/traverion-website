import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AdminShell panel code-splitting', () => {
  it('lazy-loads heavy admin panels instead of eager static imports', () => {
    const src = readFileSync(resolve(__dirname, 'AdminShell.tsx'), 'utf8');
    expect(src).toContain("lazy(() => import('./AdminBookingsPanel'))");
    expect(src).toContain("lazy(() => import('./AdminFinancePanel'))");
    expect(src).toContain("lazy(() => import('./AdminCommercialPanel'))");
    expect(src).toContain("lazy(() => import('./AdminListingsModerationPanel'))");
    expect(src).not.toMatch(/import AdminBookingsPanel from/);
    expect(src).toContain('<Suspense');
    expect(src).toContain('prefetchAdminTab');
  });
});
