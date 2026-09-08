import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pathEquals } from './authNavigation';
import { partnerRedirectForSession } from './partnerAuthState';
import { travelerAuthPathIsConsumerOnly, travelerRedirectForSession } from './travelerAuthState';

const vercel = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../vercel.json'), 'utf8')
) as { redirects?: Array<{ source: string; destination: string; permanent?: boolean }> };

describe('partner signup reload loop', () => {
  it('does not treat /signup as a different destination from itself', () => {
    expect(pathEquals('/signup', '/signup')).toBe(true);
    expect(pathEquals('/signup/', '/signup')).toBe(true);
    expect(pathEquals('/login', '/signup')).toBe(false);
  });

  it('never redirects while partner session is unknown or checking', () => {
    const hosts = ['partner.traverion.com', 'localhost'] as const;
    for (const hostname of hosts) {
      for (const kind of ['unknown', 'checking-profile', 'error'] as const) {
        expect(partnerRedirectForSession({ kind, pathname: '/signup', hostname })).toBeNull();
        expect(partnerRedirectForSession({ kind, pathname: '/login', hostname })).toBeNull();
        expect(partnerRedirectForSession({ kind, pathname: '/partner', hostname })).toBeNull();
      }
    }
  });

  it('keeps logged-out visitors on landing, login, and signup', () => {
    expect(
      partnerRedirectForSession({ kind: 'anon', pathname: '/signup', hostname: 'partner.traverion.com' })
    ).toBeNull();
    expect(
      partnerRedirectForSession({ kind: 'anon', pathname: '/login', hostname: 'partner.traverion.com' })
    ).toBeNull();
    expect(
      partnerRedirectForSession({ kind: 'anon', pathname: '/', hostname: 'partner.traverion.com' })
    ).toBeNull();
    expect(
      partnerRedirectForSession({ kind: 'anon', pathname: '/partner', hostname: 'partner.traverion.com' })
    ).toBe('/login');
  });

  it('sends a ready partner off auth pages once, never ping-ponging on /partner', () => {
    expect(
      partnerRedirectForSession({ kind: 'partner', pathname: '/signup', hostname: 'partner.traverion.com' })
    ).toBe('/partner');
    expect(
      partnerRedirectForSession({ kind: 'partner', pathname: '/login', hostname: 'partner.traverion.com' })
    ).toBe('/partner');
    expect(
      partnerRedirectForSession({
        kind: 'partner',
        pathname: '/login',
        hostname: 'partner.traverion.com',
        returnPath: '/partner/bookings?booking=abc',
      })
    ).toBe('/partner/bookings?booking=abc');
    expect(
      partnerRedirectForSession({
        kind: 'partner',
        pathname: '/login',
        hostname: 'partner.traverion.com',
        returnPath: '/trips',
      })
    ).toBe('/partner');
    expect(
      partnerRedirectForSession({ kind: 'partner', pathname: '/', hostname: 'partner.traverion.com' })
    ).toBe('/partner');
  });

  it('sends a traveler-blocked session to login only when they are inside the app', () => {
    expect(
      partnerRedirectForSession({
        kind: 'traveler-blocked',
        pathname: '/partner',
        hostname: 'partner.traverion.com',
      })
    ).toBe('/login');
    expect(
      partnerRedirectForSession({
        kind: 'traveler-blocked',
        pathname: '/signup',
        hostname: 'partner.traverion.com',
      })
    ).toBeNull();
  });
});

describe('traveler auth never redirects into Partner', () => {
  it('keeps loading and recovery still', () => {
    expect(travelerRedirectForSession({ kind: 'unknown', pathname: '/log-in' })).toBeNull();
    expect(travelerRedirectForSession({ kind: 'recovery', pathname: '/set-password' })).toBeNull();
  });

  it('does not bounce an anonymous visitor off /log-in', () => {
    expect(travelerRedirectForSession({ kind: 'anon', pathname: '/log-in' })).toBeNull();
    expect(travelerRedirectForSession({ kind: 'anon', pathname: '/login' })).toBeNull();
  });

  it('treats traveler auth paths as consumer-only', () => {
    expect(travelerAuthPathIsConsumerOnly('/log-in')).toBe(true);
    expect(travelerAuthPathIsConsumerOnly('/set-password')).toBe(true);
    expect(travelerAuthPathIsConsumerOnly('/partner')).toBe(false);
    expect(travelerAuthPathIsConsumerOnly('/signup')).toBe(false);
  });
});

describe('vercel traveler /login must stay on the traveler product', () => {
  it('does not 301 www or apex /login to partner.traverion.com', () => {
    const redirects = (vercel as { redirects?: Array<{ source: string; destination: string }> }).redirects ?? [];
    const loginToPartner = redirects.filter(
      (r) => r.source === '/login' && r.destination.includes('partner.traverion.com')
    );
    expect(loginToPartner).toEqual([]);
  });

  it('sends www /login to same-host /log-in, not a permanent partner hop', () => {
    const redirects = vercel.redirects ?? [];
    const wwwLogin = redirects.find(
      (r) => r.source === '/login' && !r.destination.includes('https://')
    );
    expect(wwwLogin?.destination).toBe('/log-in');
    expect(wwwLogin?.permanent).toBe(false);
  });
});
