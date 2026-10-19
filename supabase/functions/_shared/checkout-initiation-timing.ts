/**
 * Edge checkout timing — stage durations only (no PII / secrets).
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
