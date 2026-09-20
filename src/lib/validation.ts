/**
 * Client-side validation helpers for forms.
 * Use for UX; always validate on the server / Supabase for security.
 */

import { localYmd } from './local-ymd';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length <= 254 && EMAIL_REGEX.test(trimmed);
}

export function required(value: string | undefined | null, minLength = 1): { valid: boolean; message?: string } {
  const t = typeof value === 'string' ? value.trim() : '';
  if (t.length < minLength) return { valid: false, message: 'This field is required' };
  return { valid: true };
}

export function maxLength(value: string | undefined, max: number): { valid: boolean; message?: string } {
  const len = (value ?? '').length;
  if (len > max) return { valid: false, message: `Maximum ${max} characters` };
  return { valid: true };
}

export function validateEmail(value: string | undefined): { valid: boolean; message?: string } {
  const t = (value ?? '').trim();
  if (!t) return { valid: false, message: 'Email is required' };
  if (!isValidEmail(t)) return { valid: false, message: 'Please enter a valid email address' };
  return { valid: true };
}

/** Date string YYYY-MM-DD must be today or in the future (local calendar, not UTC parse). */
export function dateNotInPast(dateStr: string | undefined): { valid: boolean; message?: string } {
  if (!dateStr || !dateStr.trim()) return { valid: false, message: 'Please select a date' };
  const day = dateStr.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { valid: false, message: 'Invalid date' };
  if (day < localYmd()) return { valid: false, message: 'Date must be today or in the future' };
  return { valid: true };
}

export function sanitizeForDisplay(input: string | undefined | null, maxLength = 2000): string {
  if (input == null) return '';
  const s = String(input).trim().slice(0, maxLength);
  return s;
}
