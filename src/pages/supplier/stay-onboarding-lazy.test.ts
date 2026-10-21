import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Stay onboarding code-splitting', () => {
  it('lazy-loads StayOnboardingFlow so tour editors skip the stay wizard chunk', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierListingForm.tsx'), 'utf8');
    expect(src).toContain("lazy(() => import('../../components/supplier/listing-creation/StayOnboardingFlow'))");
    expect(src).not.toMatch(/import StayOnboardingFlow from/);
    expect(src).toContain('<Suspense');
  });
});
