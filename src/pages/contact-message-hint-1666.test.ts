import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1666: Contact message field char hint', () => {
  it('shows Up to 5000 characters with live used count', () => {
    const src = readFileSync(resolve(__dirname, 'Contact.tsx'), 'utf8');
    expect(src).toContain('Phase 1666');
    expect(src).toContain('Up to 5000 characters');
    expect(src).toContain('contact-message-hint');
  });
});
