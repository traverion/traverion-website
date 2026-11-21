export type TravelerToastKind = 'login' | 'welcome' | 'logout';

export type TravelerToastCopy = {
  title: string;
  message: string;
};

export const TRAVELER_TOAST_COPY: Record<TravelerToastKind, TravelerToastCopy> = {
  login: { title: 'Welcome back!', message: "You're successfully logged in." },
  welcome: { title: 'Welcome to Traverion!', message: 'Your account is ready. Start exploring.' },
  logout: { title: "You've logged out", message: 'See you on your next adventure.' },
};

export const TRAVELER_CHECK_EMAIL: TravelerToastCopy = {
  title: 'Check your email',
  message: 'Confirm your address to finish creating your account.',
};

const STORAGE_KEY = 'traverion_traveler_toast';
const EVENT = 'traverion-toast';
const TTL_MS = 8000;

export type ArmedTravelerToast = {
  id: string;
  kind: TravelerToastKind;
  page: string;
  at: number;
};

let sequence = 0;
let memory: ArmedTravelerToast | null = null;

function readStored(): ArmedTravelerToast | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ArmedTravelerToast;
    if (!parsed || !TRAVELER_TOAST_COPY[parsed.kind] || !parsed.page) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readArmed(): ArmedTravelerToast | null {
  if (memory) return memory;
  memory = readStored();
  return memory;
}

function writeArmed(next: ArmedTravelerToast | null) {
  memory = next;
  if (typeof sessionStorage !== 'undefined') {
    try {
      if (!next) sessionStorage.removeItem(STORAGE_KEY);
      else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

/** Queue one toast for a specific traveler page. A repeat of the same toast is ignored. */
export function armTravelerToast(kind: TravelerToastKind, page: string, now = Date.now()): void {
  const target = page.trim();
  if (!target || !TRAVELER_TOAST_COPY[kind]) return;
  const existing = readArmed();
  if (existing && existing.kind === kind && existing.page === target && now - existing.at < TTL_MS) return;
  sequence += 1;
  writeArmed({ id: `tv-toast-${sequence}`, kind, page: target, at: now });
}

/**
 * Return the toast only when this page is the one it was armed for.
 * A different page leaves it waiting. An expired toast is dropped.
 */
export function takeTravelerToast(page: string, now = Date.now()): (ArmedTravelerToast & TravelerToastCopy) | null {
  const armed = readArmed();
  if (!armed) return null;
  if (now - armed.at > TTL_MS) {
    writeArmed(null);
    return null;
  }
  if (armed.page !== page) return null;
  writeArmed(null);
  return { ...armed, ...TRAVELER_TOAST_COPY[armed.kind] };
}

export function subscribeTravelerToast(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export function resetTravelerToastsForTests() {
  sequence = 0;
  memory = null;
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}
