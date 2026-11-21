export const CONFIRMATION_RESEND_COOLDOWN_MS = 30_000;

let cooldownUntil = 0;

export function confirmationResendRemainingMs(now = Date.now()): number {
  return Math.max(0, cooldownUntil - now);
}

export function startConfirmationResendCooldown(now = Date.now()): void {
  cooldownUntil = now + CONFIRMATION_RESEND_COOLDOWN_MS;
}

export function resetConfirmationResendCooldown(): void {
  cooldownUntil = 0;
}
