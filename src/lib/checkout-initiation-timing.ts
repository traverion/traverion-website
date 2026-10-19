/**
 * Checkout initiation timing — stage durations only.
 * Never attach emails, names, payment IDs, or secrets.
 */

export type CheckoutTimingMarks = Record<string, number>;

export function createCheckoutTiming(nowMs: () => number = Date.now): {
  mark: (name: string) => void;
  snapshot: () => CheckoutTimingMarks & { totalMs: number };
} {
  const t0 = nowMs();
  const marks: CheckoutTimingMarks = {};
  return {
    mark(name: string) {
      marks[name] = Math.max(0, nowMs() - t0);
    },
    snapshot() {
      return { ...marks, totalMs: Math.max(0, nowMs() - t0) };
    },
  };
}

/** Merge client + server marks; server keys prefixed with `server_`. */
export function mergeCheckoutTimings(
  client: CheckoutTimingMarks & { totalMs?: number },
  server: CheckoutTimingMarks | null | undefined
): CheckoutTimingMarks & { totalMs: number } {
  const out: CheckoutTimingMarks & { totalMs: number } = {
    ...client,
    totalMs: typeof client.totalMs === 'number' ? client.totalMs : 0,
  };
  if (server && typeof server === 'object') {
    for (const [k, v] of Object.entries(server)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        out[`server_${k}`] = v;
      }
    }
  }
  return out;
}

export function logCheckoutInitiationTiming(
  timings: CheckoutTimingMarks & { totalMs: number },
  meta?: { ok?: boolean }
): void {
  try {
    console.info('[Traverion] checkout initiation timing', {
      ok: meta?.ok ?? null,
      totalMs: timings.totalMs,
      stages: timings,
    });
  } catch {
    /* ignore console failures */
  }
}
