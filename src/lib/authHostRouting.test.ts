import { describe, expect, it } from 'vitest';
import {
  isPartnerHostname,
  isTravelerMarketingHostname,
  travelerMarketingLoginAlias,
  travelerMarketingRecoveryPath,
} from './authHostRouting';

describe('auth host boundaries', () => {
  it('treats www and apex as traveler marketing, partner as partner', () => {
    expect(isTravelerMarketingHostname('www.traverion.com')).toBe(true);
    expect(isTravelerMarketingHostname('traverion.com')).toBe(true);
    expect(isTravelerMarketingHostname('partner.traverion.com')).toBe(false);
    expect(isPartnerHostname('partner.traverion.com')).toBe(true);
    expect(isPartnerHostname('www.traverion.com')).toBe(false);
  });

  it('rewrites traveler /login to /log-in and never to partner', () => {
    expect(travelerMarketingLoginAlias('www.traverion.com', '/login', '?next=bookings')).toBe(
      '/log-in?next=bookings'
    );
    expect(travelerMarketingLoginAlias('traverion.com', '/login', '')).toBe('/log-in');
    expect(travelerMarketingLoginAlias('partner.traverion.com', '/login', '')).toBeNull();
    expect(travelerMarketingLoginAlias('localhost', '/login', '')).toBeNull();
    expect(travelerMarketingLoginAlias('www.traverion.com', '/log-in', '')).toBeNull();
  });

  it('keeps password recovery on the same product host', () => {
    expect(travelerMarketingRecoveryPath('www.traverion.com', '/login')).toBe('/set-password');
    expect(travelerMarketingRecoveryPath('www.traverion.com', '/log-in')).toBe('/set-password');
    expect(travelerMarketingRecoveryPath('partner.traverion.com', '/login')).toBe('/reset-password');
    expect(travelerMarketingRecoveryPath('partner.traverion.com', '/signup')).toBe('/reset-password');
  });
});
