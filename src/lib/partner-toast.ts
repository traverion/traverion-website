export type PartnerToastTone = 'success' | 'error' | 'info';

export type PartnerToast = {
  id: string;
  tone: PartnerToastTone;
  message: string;
};

const MAX_TOASTS = 3;
let items: PartnerToast[] = [];
const listeners = new Set<(next: PartnerToast[]) => void>();
let sequence = 0;

export function toastDuration(tone: PartnerToastTone): number {
  if (tone === 'success') return 3000;
  if (tone === 'error') return 5500;
  return 4000;
}

/** Keeps the newest few and ignores a toast that is already on screen. */
export function mergePartnerToasts(current: readonly PartnerToast[], next: PartnerToast): PartnerToast[] {
  if (current.some((item) => item.tone === next.tone && item.message === next.message)) return [...current];
  return [...current, next].slice(-MAX_TOASTS);
}

function emit() {
  const snapshot = items;
  listeners.forEach((listener) => listener(snapshot));
}

export function showPartnerToast(tone: PartnerToastTone, message: string): string | null {
  const text = message.trim();
  if (!text) return null;
  const next = { id: `toast-${++sequence}`, tone, message: text };
  const merged = mergePartnerToasts(items, next);
  if (merged.length === items.length && merged.every((item, index) => item.id === items[index]?.id)) return null;
  items = merged;
  emit();
  return next.id;
}

export function dismissPartnerToast(id: string) {
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return;
  items = next;
  emit();
}

export function subscribePartnerToasts(listener: (next: PartnerToast[]) => void): () => void {
  listeners.add(listener);
  listener(items);
  return () => listeners.delete(listener);
}

export const partnerToast = {
  success(message: string) {
    return showPartnerToast('success', message);
  },
  error(message: string) {
    return showPartnerToast('error', message);
  },
  info(message: string) {
    return showPartnerToast('info', message);
  },
  dismiss: dismissPartnerToast,
};

export function resetPartnerToastsForTests() {
  items = [];
  sequence = 0;
  emit();
}
