import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1661: Contact success offers browse/home exits', () => {
  it('keeps Send another and adds Browse tours / Back to home', () => {
    const src = readFileSync(resolve(__dirname, 'Contact.tsx'), 'utf8');
    expect(src).toContain('Phase 1661');
    const success = src.slice(src.indexOf('{isSubmitted ?'), src.indexOf(') : ('));
    expect(success).toContain('Send another message');
    expect(success).toContain('Browse tours');
    expect(success).toContain('Back to home');
  });
});
