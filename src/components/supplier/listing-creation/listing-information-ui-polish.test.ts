import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('Information scene UI polish (source contracts)', () => {
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
});
