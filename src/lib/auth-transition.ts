export type AuthTransitionIntent = 'login' | 'signup' | 'logout' | 'verify' | 'password' | 'setup';
export type AuthTransitionPhase = 'pending' | 'success' | 'check-email' | 'error';

export type AuthTransition = {
  id: number;
  intent: AuthTransitionIntent;
  phase: AuthTransitionPhase;
  title: string;
  message: string;
  page: string | null;
  navigated: boolean;
  email: string | null;
  actionLabel: string | null;
};

export const AUTH_TRANSITION_STALL_MS = 20_000;

export function authTransitionSuccessHold(reducedMotion: boolean): number {
  return reducedMotion ? 180 : 1000;
}

export function authTransitionCloseDelay(reducedMotion: boolean): number {
  return reducedMotion ? 180 : 250;
}

let sequence = 0;
let current: AuthTransition | null = null;
let navigateOnce: (() => void) | null = null;
let continueCheckEmail: (() => void) | null = null;
const listeners = new Set<(next: AuthTransition | null) => void>();

function emit() {
  const snapshot = current;
  listeners.forEach((listener) => listener(snapshot));
}

export function subscribeAuthTransition(listener: (next: AuthTransition | null) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}

function isBusy(): boolean {
  return current?.phase === 'pending' || current?.phase === 'success';
}

/** Opens the spinner. A second call while one is running returns the same id. */
export function beginAuthTransition(input: {
  intent: AuthTransitionIntent;
  title: string;
  message: string;
}): number {
  if (current && isBusy()) return current.id;
  sequence += 1;
  navigateOnce = null;
  continueCheckEmail = null;
  current = {
    id: sequence,
    intent: input.intent,
    phase: 'pending',
    title: input.title,
    message: input.message,
    page: null,
    navigated: false,
    email: null,
    actionLabel: null,
  };
  emit();
  return current.id;
}

/** Checkmark only after the server has confirmed the action. */
export function succeedAuthTransition(
  id: number,
  input: { title: string; message: string; page: string; navigate?: () => void }
): void {
  if (!current || current.id !== id || current.phase !== 'pending') return;
  navigateOnce = input.navigate ?? null;
  current = {
    ...current,
    phase: 'success',
    title: input.title,
    message: input.message,
    page: input.page,
    navigated: false,
    email: null,
    actionLabel: null,
  };
  emit();
}

/** Confirmed session already exists, such as an email link that just verified. */
export function showConfirmedAuthTransition(input: {
  intent: AuthTransitionIntent;
  title: string;
  message: string;
  page: string;
  navigate?: () => void;
}): number {
  if (current && isBusy()) return current.id;
  sequence += 1;
  navigateOnce = input.navigate ?? null;
  current = {
    id: sequence,
    intent: input.intent,
    phase: 'success',
    title: input.title,
    message: input.message,
    page: input.page,
    navigated: false,
    email: null,
    actionLabel: null,
  };
  emit();
  return current.id;
}

export function checkEmailAuthTransition(
  id: number,
  input: { title: string; message: string; email?: string; actionLabel?: string; onContinue?: () => void }
): void {
  if (!current || current.id !== id || current.phase !== 'pending') return;
  navigateOnce = null;
  continueCheckEmail = input.onContinue ?? null;
  current = {
    ...current,
    phase: 'check-email',
    title: input.title,
    message: input.message,
    page: null,
    navigated: false,
    email: input.email?.trim() || null,
    actionLabel: input.actionLabel?.trim() || null,
  };
  emit();
}

export function failAuthTransition(id: number, message: string): void {
  if (!current || current.id !== id || current.phase !== 'pending') return;
  navigateOnce = null;
  current = {
    ...current,
    phase: 'error',
    title: 'Couldn’t continue',
    message: message.trim() || 'Something went wrong. Try again.',
    page: null,
    navigated: false,
    email: null,
    actionLabel: null,
  };
  emit();
}

/** Closes the spinner when the form itself should explain the result. */
export function cancelAuthTransition(id: number): void {
  if (!current || current.id !== id || current.phase !== 'pending') return;
  current = null;
  navigateOnce = null;
  continueCheckEmail = null;
  emit();
}

/** Leaves the check-email modal and runs the login handoff once. */
export function continueAuthCheckEmail(): void {
  if (!current || current.phase !== 'check-email') return;
  const go = continueCheckEmail;
  continueCheckEmail = null;
  current = null;
  navigateOnce = null;
  emit();
  go?.();
}

/** Runs the destination change once, after the checkmark has been shown. */
export function markAuthTransitionNavigated(id: number): void {
  if (!current || current.id !== id || current.phase !== 'success' || current.navigated) return;
  current = { ...current, navigated: true };
  const go = navigateOnce;
  navigateOnce = null;
  emit();
  go?.();
}

export function completeAuthTransition(id: number): void {
  if (!current || current.id !== id || current.phase !== 'success' || !current.navigated) return;
  current = null;
  navigateOnce = null;
  emit();
}

/** Error and check-email can return to the form. Pending and success cannot. */
export function dismissAuthTransition(): void {
  if (!current || current.phase === 'pending' || current.phase === 'success') return;
  current = null;
  navigateOnce = null;
  continueCheckEmail = null;
  emit();
}

export function resetAuthTransitionForTests(): void {
  sequence = 0;
  current = null;
  navigateOnce = null;
  continueCheckEmail = null;
  emit();
}

export function peekAuthTransition(): AuthTransition | null {
  return current;
}
