import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('listing creation mobile app chrome', () => {
  it('exposes a shared mobile step strip and app-like footers', () => {
    const strip = readFileSync(resolve(__dirname, 'ListingCreationMobileStepStrip.tsx'), 'utf8');
    const mobile = readFileSync(resolve(__dirname, 'ListingCreationMobileProgress.tsx'), 'utf8');
    const option = readFileSync(resolve(__dirname, 'TourOptionWorkspace.tsx'), 'utf8');
    const schedule = readFileSync(resolve(__dirname, 'TourScheduleWorkspace.tsx'), 'utf8');
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');
    expect(strip).toContain('listing-creation-mobile-steps');
    expect(mobile).toContain('ListingCreationMobileStepStrip');
    expect(option).toContain('ListingCreationMobileStepStrip');
    expect(schedule).toContain('ListingCreationMobileStepStrip');
    expect(option).toContain('!min-h-12');
    expect(schedule).toContain('!min-h-12');
    expect(css).toContain('Mobile app shell for tour / stay creation');
    expect(css).toContain('font-size: 16px');
  });
});
