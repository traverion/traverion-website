import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PARTNER_NAV_OPEN_GROUPS_KEY,
  readPartnerNavOpenGroups,
  writePartnerNavOpenGroups,
} from './partnerNav';

describe('partner nav open groups preference', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to groups marked defaultOpen', () => {
    expect(readPartnerNavOpenGroups().sort()).toEqual(['stays', 'tours']);
  });

  it('persists and restores known group ids only', () => {
    writePartnerNavOpenGroups(['tours', 'unknown', 'stays']);
    expect(store.get(PARTNER_NAV_OPEN_GROUPS_KEY)).toBe('tours,unknown,stays');
    expect(readPartnerNavOpenGroups()).toEqual(['tours', 'stays']);
  });
});
