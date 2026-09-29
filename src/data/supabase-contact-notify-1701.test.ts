import { describe, expect, it } from 'vitest';
import { contactInquiryNotifySucceeded } from './supabase-contact';

describe('Phase 1701: contact inquiry notify must succeed for UI success', () => {
  it('accepts success and idempotent skip', () => {
    expect(contactInquiryNotifySucceeded({ success: true }, null)).toEqual({ ok: true });
    expect(contactInquiryNotifySucceeded({ success: true, skipped: true }, null)).toEqual({
      ok: true,
    });
  });

  it('rejects invoke errors and unsuccessful payloads', () => {
    expect(contactInquiryNotifySucceeded({ success: true }, new Error('network'))).toEqual({
      ok: false,
      error: 'network',
    });
    expect(contactInquiryNotifySucceeded({ success: false, error: 'Resend error' }, null)).toEqual({
      ok: false,
      error: 'Resend error',
    });
    expect(contactInquiryNotifySucceeded(null, null).ok).toBe(false);
    expect(contactInquiryNotifySucceeded({ success: false }, null).ok).toBe(false);
  });
});
