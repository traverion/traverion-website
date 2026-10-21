import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearPartnerInboxReturn,
  consumePartnerPageTransition,
  markPartnerPageTransition,
  partnerInboxReturnMatches,
  readPartnerInboxReturn,
  rememberPartnerInboxReturn,
} from './partner-page-transition';

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, String(value));
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    },
  });
  clearPartnerInboxReturn();
  consumePartnerPageTransition();
});

describe('partner-page-transition', () => {
  it('consumes transition direction once', () => {
    markPartnerPageTransition('forward');
    expect(consumePartnerPageTransition()).toBe('forward');
    expect(consumePartnerPageTransition()).toBeNull();
  });

  it('remembers inbox return booking identity', () => {
    rememberPartnerInboxReturn('booking-1');
    expect(readPartnerInboxReturn()).toEqual({ bookingId: 'booking-1' });
    expect(partnerInboxReturnMatches('booking-1')).toBe(true);
    expect(partnerInboxReturnMatches('booking-2')).toBe(false);
  });
});
