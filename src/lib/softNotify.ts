/**
 * Phase 1859: separate AUTHORITATIVE business success from secondary email/notify outcome.
 * Notify failure must never be framed as the primary operation failing.
 */

export type SoftNotifyResult = {
  sent: boolean;
  /** Idempotent already_sent / intentional skip — not a failure to surface. */
  skipped?: boolean;
  error?: string;
};

/** User-facing soft warning when DB/RPC already succeeded. */
export const SOFT_NOTIFY_FAILED_COPY =
  'Saved, but email notification may not have been sent. The change is already recorded in Traverion.';

export function softNotifyWarningFromResults(...results: SoftNotifyResult[]): string | null {
  const failed = results.filter((r) => !r.sent && !r.skipped);
  if (failed.length === 0) return null;
  const detail = failed.map((r) => (r.error ?? '').trim()).find(Boolean);
  if (detail) {
    return `Saved, but email notification failed: ${detail}. The change is already recorded in Traverion.`;
  }
  return SOFT_NOTIFY_FAILED_COPY;
}

export function softNotifyFromSupplierInvoke(r: {
  success: boolean;
  error?: string;
}): SoftNotifyResult {
  if (r.success) return { sent: true };
  return { sent: false, error: r.error };
}

/** Normalize edge JSON from notify-customer-booking / similar. */
export function softNotifyFromEdgePayload(
  data: { success?: boolean; skipped?: boolean; error?: string } | null | undefined,
  invokeError?: { message?: string } | null
): SoftNotifyResult {
  if (invokeError?.message) return { sent: false, error: invokeError.message };
  if (data?.skipped) return { sent: false, skipped: true };
  if (data?.success) return { sent: true };
  return {
    sent: false,
    error: typeof data?.error === 'string' && data.error.trim() ? data.error : 'Notify failed',
  };
}
