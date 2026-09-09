/** Partner Today empty schedule — do not claim “nothing needs you” when Needs attention has work. */

export function partnerTodayEmptyScheduleCopy(attentionCount: number): { title: string; body: string } {
  if (attentionCount > 0) {
    return {
      title: 'No guests on the schedule today',
      body: 'Nothing is booked for today, but items below still need your attention.',
    };
  }
  return {
    title: "You're set for today",
    body: 'Nothing needs you right now. Guests and stay arrivals appear here when they are booked for today.',
  };
}
