import { describe, expect, it } from 'vitest';
import { buildContactFormEmailSubject } from '../lib/contactEmailSubject';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1621: Contact form subject includes topic tag', () => {
  it('buildContactFormEmailSubject tags the topic', () => {
    expect(buildContactFormEmailSubject('My trip')).toBe('[Traverion · Contact · My trip]');
    expect(buildContactFormEmailSubject('  ')).toBe('[Traverion · Contact · Contact form message]');
  });

  it('Contact page uses buildContactFormEmailSubject', () => {
    const src = readFileSync(resolve(__dirname, 'Contact.tsx'), 'utf8');
    expect(src).toContain('Phase 1621');
    expect(src).toContain('buildContactFormEmailSubject');
  });
});
