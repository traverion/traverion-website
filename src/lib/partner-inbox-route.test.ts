import { describe, expect, it } from 'vitest';
import { partnerInboxHref, readPartnerInboxBookingId } from './partner-inbox-route';

describe('partner inbox route', () => {
  it('reads booking id from /partner/inbox/:id and legacy ?booking=', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(readPartnerInboxBookingId(`/partner/inbox/${id}`, '')).toBe(id);
    expect(readPartnerInboxBookingId('/partner/inbox', `?booking=${id}`)).toBe(id);
    expect(readPartnerInboxBookingId('/partner/inbox', '')).toBeNull();
    expect(readPartnerInboxBookingId('/partner/inbox/not-a-uuid', '')).toBeNull();
  });

  it('builds path-based Message customer hrefs', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(partnerInboxHref({ bookingId: id })).toBe(`/partner/inbox/${id}`);
    expect(partnerInboxHref({ bookingId: id, unreadOnly: true })).toBe(
      `/partner/inbox/${id}?unread=1`
    );
    expect(partnerInboxHref({ unreadOnly: true })).toBe('/partner/inbox?unread=1');
    expect(partnerInboxHref()).toBe('/partner/inbox');
  });
});
