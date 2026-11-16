/**
 * LIVE Accounts v2 creation gate.
 * The stored flag remains `live_custom_onboarding_enabled`.
 * TEST creation does not use this gate. LIVE creation requires the flag AND an allowlist row.
 * Missing flag, unreadable flag, or an empty allowlist refuses creation before Stripe.
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
