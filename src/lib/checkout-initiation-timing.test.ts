import { describe, expect, it } from 'vitest';
import {
  createCheckoutTiming,
  mergeCheckoutTimings,
} from './checkout-initiation-timing';

describe('checkout initiation timing', () => {
  it('records stage offsets from start', () => {
    let now = 1000;
    const t = createCheckoutTiming(() => now);
    now = 1050;
    t.mark('client_ready');
    now = 1800;
    t.mark('edge_returned');
    const snap = t.snapshot();
    expect(snap.client_ready).toBe(50);
    expect(snap.edge_returned).toBe(800);
    expect(snap.totalMs).toBe(800);
  });

  it('merges server marks without overwriting client keys', () => {
    const merged = mergeCheckoutTimings(
      { client_ready: 10, edge_invoke: 20, totalMs: 900 },
      { authMs: 40, stripeMs: 500, totalMs: 700 }
    );
    expect(merged.client_ready).toBe(10);
    expect(merged.server_authMs).toBe(40);
    expect(merged.server_stripeMs).toBe(500);
    expect(merged.totalMs).toBe(900);
  });
});
