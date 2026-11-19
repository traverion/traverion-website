import { describe, expect, it } from 'vitest';
import {
  mergePartnerToasts,
  partnerToast,
  resetPartnerToastsForTests,
  subscribePartnerToasts,
  toastDuration,
} from './partner-toast';

describe('partner toasts', () => {
  it('uses a short success time and a longer error time', () => {
    expect(toastDuration('success')).toBe(3000);
    expect(toastDuration('error')).toBe(5500);
  });

  it('ignores a duplicate and stacks the next distinct message', () => {
    const first = { id: 'a', tone: 'success' as const, message: 'Listing saved' };
    const again = mergePartnerToasts([first], { id: 'b', tone: 'success', message: 'Listing saved' });
    expect(again).toEqual([first]);
    const stacked = mergePartnerToasts(again, { id: 'c', tone: 'error', message: "Couldn't save changes. Try again." });
    expect(stacked.map((item) => item.id)).toEqual(['a', 'c']);
  });

  it('drops the oldest toast when more than three are waiting', () => {
    const list = [1, 2, 3].map((n) => ({ id: String(n), tone: 'info' as const, message: `Note ${n}` }));
    const next = mergePartnerToasts(list, { id: '4', tone: 'info', message: 'Note 4' });
    expect(next.map((item) => item.message)).toEqual(['Note 2', 'Note 3', 'Note 4']);
  });

  it('publishes a success only once for the same message', () => {
    resetPartnerToastsForTests();
    const seen: string[][] = [];
    const stop = subscribePartnerToasts((items) => seen.push(items.map((item) => item.message)));
    partnerToast.success('Privacy policy saved');
    partnerToast.success('Privacy policy saved');
    partnerToast.error("Couldn't save changes. Try again.");
    stop();
    expect(seen.at(-1)).toEqual(['Privacy policy saved', "Couldn't save changes. Try again."]);
    resetPartnerToastsForTests();
  });
});
