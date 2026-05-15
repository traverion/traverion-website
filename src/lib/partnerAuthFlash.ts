/** One-shot messages for partner login/sign-up after redirect (e.g. traveler session on partner host). */

const STORAGE_KEY = 'traverion_partner_auth_flash';

export type PartnerAuthFlash = {
  kind: 'error';
  message: string;
  email?: string;
  tab?: 'signin' | 'signup';
};

export function setPartnerAuthFlash(payload: Omit<PartnerAuthFlash, 'kind'> & { kind?: 'error' }): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        kind: 'error',
        message: payload.message,
        email: payload.email,
        tab: payload.tab ?? 'signin',
      } satisfies PartnerAuthFlash)
    );
  } catch {
    /* private mode / quota */
  }
}

export function consumePartnerAuthFlash(): PartnerAuthFlash | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as Partial<PartnerAuthFlash>;
    if (parsed?.kind === 'error' && typeof parsed.message === 'string' && parsed.message.trim()) {
      return {
        kind: 'error',
        message: parsed.message.trim(),
        email: typeof parsed.email === 'string' ? parsed.email : undefined,
        tab: parsed.tab === 'signup' ? 'signup' : 'signin',
      };
    }
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
  }
  return null;
}
