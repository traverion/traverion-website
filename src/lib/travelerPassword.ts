export const TRAVELER_PASSWORD_HINT = 'At least 8 characters, with a letter and a number.';

/** Signup-only. Existing passwords are not rechecked against this rule. */
export function travelerPasswordError(password: string): string | null {
  if (!password) return 'Enter a password.';
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return TRAVELER_PASSWORD_HINT;
  }
  return null;
}
