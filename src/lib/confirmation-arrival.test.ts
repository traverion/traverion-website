import { describe, expect, it } from 'vitest';
import { confirmationArrival } from './confirmation-arrival';

describe('confirmation arrival', () => {
  it('shows the saved pickup and does not invent a time', () => {
    expect(
      confirmationArrival({
        fulfillment: 'pickup',
        meetingPoint: 'Ruokasenkatu 3',
        specialRequests: 'Place of stay: Arctic Hotel',
        pickupTime: '',
      })
    ).toEqual({ label: 'Pickup location', value: 'Arctic Hotel', time: null });
  });

  it('shows a real pickup time only when one is stored', () => {
    expect(
      confirmationArrival({
        fulfillment: 'pickup',
        specialRequests: 'Place of stay: Arctic Hotel',
        pickupTime: '18:10:00',
      })?.time
    ).toBe('18:10');
  });

  it('shows the meeting address and hides pickup details', () => {
    expect(
      confirmationArrival({
        fulfillment: 'meeting_point',
        meetingPoint: 'Ruokasenkatu 3',
        specialRequests: 'Place of stay: Arctic Hotel',
        pickupTime: '18:10',
      })
    ).toEqual({ label: 'Meeting point', value: 'Ruokasenkatu 3', time: null });
  });

  it('does not invent a meeting address', () => {
    expect(
      confirmationArrival({
        fulfillment: 'meeting_point',
        meetingPoint: '  ',
      })
    ).toEqual({ label: 'Meeting point', value: null, time: null });
  });
});
