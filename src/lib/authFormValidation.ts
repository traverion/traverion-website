/** Client-side email check (avoid relying on browser `type="email"` tooltips). */
export function isValidEmailFormat(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

export function authInputErrorClasses(hasError: boolean): string {
  return hasError
    ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
    : 'border-gray-200 focus:border-finland focus:ring-finland';
}
