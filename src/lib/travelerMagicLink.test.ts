import { describe, expect, it } from 'vitest';
import { travelerMagicLinkRedirect } from './travelerMagicLink';

describe('traveler magic link redirect', () => {
  it('keeps a known traveler destination on the public site', () => {
    const url = new URL(travelerMagicLinkRedirect('bookings'));
    expect(url.pathname).toBe('/log-in');
    expect(url.searchParams.get('next')).toBe('bookings');
    expect(url.origin).not.toContain('partner.');
  });

  it('keeps a same-origin checkout page and drops an off-site return', () => {
    const kept = new URL(travelerMagicLinkRedirect('home', '/tours/lapland?date=2026-12-01'));
    expect(kept.pathname).toBe('/tours/lapland');
    expect(kept.searchParams.get('date')).toBe('2026-12-01');
    expect(kept.hostname).toBe('www.traverion.com');
    const dropped = new URL(travelerMagicLinkRedirect('bookings', 'https://evil.example/phish'));
    expect(dropped.hostname).not.toBe('evil.example');
    expect(dropped.searchParams.get('next')).toBe('home');
  });

  it('drops an unknown destination instead of following it', () => {
    const url = new URL(travelerMagicLinkRedirect('https://evil.example/steal'));
    expect(url.searchParams.get('next')).toBe('home');
    expect(url.hostname).not.toBe('evil.example');
  });
});