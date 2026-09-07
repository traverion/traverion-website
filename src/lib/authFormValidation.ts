/** Client-side email check (avoid relying on browser `type="email"` tooltips). */
export function isValidEmailFormat(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

export function authInputErrorClasses(hasError: boolean): string {
  return hasError ? 'tv-input shadow-[0_0_0_2px_rgba(185,28,28,0.45)]' : 'tv-input';
}
