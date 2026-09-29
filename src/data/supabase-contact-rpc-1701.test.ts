import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1701: contact inquiry RPC + notify wiring', () => {
  it('uses submit_contact_inquiry RPC instead of insert().select under INSERT-only RLS', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-contact.ts'), 'utf8');
    expect(src).toContain('Phase 1701');
    expect(src).toContain("rpc('submit_contact_inquiry'");
    expect(src).not.toMatch(/\.from\('contact_inquiries'\)\s*\.insert/);
    expect(src).toContain('contactInquiryNotifySucceeded');
    expect(src).toContain('notify-contact-inquiry');
  });

  it('migration defines SECURITY DEFINER submit_contact_inquiry for anon', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/210_submit_contact_inquiry_rpc.sql'),
      'utf8'
    );
    expect(sql).toContain('Phase 1701');
    expect(sql).toContain('create or replace function public.submit_contact_inquiry');
    expect(sql).toContain('security definer');
    expect(sql).toContain('grant execute');
    expect(sql).toContain('to anon, authenticated');
  });
});
