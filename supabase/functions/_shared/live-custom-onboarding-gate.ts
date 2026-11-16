/**
 * P9.3 — LIVE Custom connected-account creation gate.
 * TEST creation is unchanged. LIVE creation requires the runtime flag AND an allowlist row.
 * Missing flag, unreadable flag, or an empty allowlist refuses creation.
 */

export function liveCustomCreateAllowed(input: {
  platformMode: string;
  flagValue: number | null | undefined;
  supplierApproved: boolean;
}): { allowed: boolean; reason: string | null } {
  if (input.platformMode !== 'live') {
    return { allowed: true, reason: null };
  }
  if (Number(input.flagValue) !== 1) {
    return { allowed: false, reason: 'LIVE payout account creation is turned off.' };
  }
  if (!input.supplierApproved) {
    return {
      allowed: false,
      reason: 'This supplier is not approved for LIVE payout account creation.',
    };
  }
  return { allowed: true, reason: null };
}
