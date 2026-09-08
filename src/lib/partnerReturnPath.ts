const KEY = 'traverion_partner_return_v1';

export function sanitizePartnerReturnPath(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/partner')) return null;
  if (trimmed.startsWith('//') || trimmed.includes('://') || trimmed.includes('\\')) return null;
  const hashless = trimmed.split('#')[0] ?? trimmed;
  const q = hashless.indexOf('?');
  const path = q >= 0 ? hashless.slice(0, q) : hashless;
  const search = q >= 0 ? hashless.slice(q + 1, q + 1 + 200) : '';
  if (!path || path.includes('..')) return null;
  return search ? `${path.slice(0, 200)}?${search}` : path.slice(0, 200);
}

export function rememberPartnerReturnPath(pathname: string, search = ''): void {
  const combined = `${pathname}${search && search.startsWith('?') ? search : search ? `?${search}` : ''}`;
  const safe = sanitizePartnerReturnPath(combined);
  if (!safe) return;
  try {
    sessionStorage.setItem(KEY, safe);
  } catch {
    /* private mode / quota */
  }
}

export function peekPartnerReturnPath(): string | null {
  try {
    return sanitizePartnerReturnPath(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function consumePartnerReturnPath(): string | null {
  const value = peekPartnerReturnPath();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return value;
}
