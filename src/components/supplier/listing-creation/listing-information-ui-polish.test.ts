import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('Information stage complete UI polish (source contracts)', () => {
  it('does not duplicate selected packing items as a text summary under chips', () => {
    const stage = read('ListingInformationStage.tsx');
    expect(stage).not.toMatch(/Selected:\s*\{/);
    expect(stage).not.toContain('labelsForCatalogIds(whatToBringIds');
  });

  it('keeps Information stage title without a redundant long stage blurb', () => {
    const form = read('../../../pages/supplier/SupplierListingForm.tsx');
    expect(form).toContain('max-w-[48rem]');
    expect(form).not.toContain(
      'Optional practical details — know before you go, what to bring, accessibility.'
    );
  });

  it('auto-grows Know before you go without forcing a tall min height', () => {
    const stage = read('ListingInformationStage.tsx');
    expect(stage).toContain('useLayoutEffect');
    expect(stage).toContain('scrollHeight');
    expect(stage).toContain('min-h-[4.5rem]');
  });

  it('places scene progress above the question for all Information scenes', () => {
    const frame = read('ListingCreationSceneFrame.tsx');
    const progressIdx = frame.indexOf('<ListingCreationSceneProgress');
    const headingIdx = frame.indexOf('id={headingId}');
    expect(progressIdx).toBeGreaterThan(-1);
    expect(headingIdx).toBeGreaterThan(progressIdx);
  });

  it('uses Scene 2 placeholders and concise optional copy', () => {
    const stage = read('ListingInformationStage.tsx');
    expect(stage).toContain('Select applicable restrictions');
    expect(stage).toContain('Select available accessibility features');
    expect(stage).toContain('Only select restrictions that genuinely apply.');
    expect(stage).toContain('Leaving this blank means not specified.');
  });

  it('marks optional Information multiselects without weakening phone publish requirement', () => {
    const stage = read('ListingInformationStage.tsx');
    const multi = read('../../ui/SearchableMultiSelect.tsx');
    const phone = read('BookingContactPhoneField.tsx');
    expect(multi).toContain('optional?: boolean');
    expect(stage).toMatch(/label="Not suitable for"[\s\S]*optional/);
    expect(stage).toMatch(/label="Accessibility features"[\s\S]*optional/);
    expect(phone).toContain('requiredForPublish');
    expect(phone).toContain('Shared only with confirmed customers');
    // Single privacy explanation above the field — not duplicated below when empty.
    expect(phone).not.toContain('Travelers will see this number after their booking is confirmed.');
  });
});
