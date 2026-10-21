import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearPartnerInboxUiState,
  readPartnerInboxUiState,
  writePartnerInboxUiState,
} from './partner-inbox-ui-state';

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
  clearPartnerInboxUiState();
});

describe('partner-inbox-ui-state', () => {
  it('round-trips filter and scroll state', () => {
    writePartnerInboxUiState({ q: 'Ada', unread: true, listScroll: 120 });
    expect(readPartnerInboxUiState()).toEqual({ q: 'Ada', unread: true, listScroll: 120 });
  });
});
