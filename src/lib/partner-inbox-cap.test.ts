import { describe, expect, it } from 'vitest';
import {
  PARTNER_INBOX_MESSAGE_FETCH_CAP,
  PARTNER_INBOX_MESSAGE_FETCH_STEP,
  partnerInboxNextFetchCap,
} from './partner-inbox-cap';

describe('partnerInboxNextFetchCap', () => {
  it('expands from the default page size', () => {
    expect(partnerInboxNextFetchCap(PARTNER_INBOX_MESSAGE_FETCH_CAP)).toBe(
      PARTNER_INBOX_MESSAGE_FETCH_CAP + PARTNER_INBOX_MESSAGE_FETCH_STEP
    );
  });

  it('never shrinks below the default page', () => {
    expect(partnerInboxNextFetchCap(10)).toBe(PARTNER_INBOX_MESSAGE_FETCH_CAP + PARTNER_INBOX_MESSAGE_FETCH_STEP);
  });
});
