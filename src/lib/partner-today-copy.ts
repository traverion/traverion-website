/** Partner Today empty schedule — keep copy compact; never claim “nothing needs you” when attention exists. */

export function partnerTodayEmptyScheduleCopy(attentionCount: number): { title: string; body: string } {
  if (attentionCount > 0) {
    return {
      title: 'No departures today',
      body: 'Items below still need attention.',
    };
  }
  return {
    title: 'No departures today',
    body: 'Upcoming bookings appear here when guests book.',
  };
}
