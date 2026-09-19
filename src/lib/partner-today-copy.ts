/** Partner Today empty schedule — keep copy compact; never claim “nothing needs you” when attention exists. */

export function partnerTodayEmptyScheduleCopy(attentionCount: number): { title: string; body: string } {
  if (attentionCount > 0) {
    return {
      title: 'Nothing on today’s schedule',
      body: 'Items below still need attention.',
    };
  }
  return {
    title: 'Nothing on today’s schedule',
    body: 'Tour departures and in-house stays appear here when guests book.',
  };
}
