import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('listing form draft coerce', () => {
  it('SupplierListingForm coerces legacy draft backups missing Information fields', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierListingForm.tsx'), 'utf8');
    expect(src).toContain('function coerceListingFormState');
    expect(src).toContain('return coerceListingFormState(parsed.form)');
    expect(src).toContain("typeof s === 'string' && s.trim()");
  });
});
