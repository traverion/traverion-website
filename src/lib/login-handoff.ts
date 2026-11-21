/**
 * Email and password kept only for the signup → login handoff in this tab.
 * Never written to storage or the URL. A refresh drops it.
 */

type Handoff = { email: string; password: string };

let pending: Handoff | null = null;

export function rememberLoginHandoff(email: string, password: string): void {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) {
    pending = null;
    return;
  }
  pending = { email: normalized, password };
}

export function takeLoginHandoff(): Handoff | null {
  const next = pending;
  pending = null;
  return next;
}

export function clearLoginHandoff(): void {
  pending = null;
}
