/** Month heading for traveler calendar pickers (UTC month, locale long name). */
export function calendarMonthTitle(year: number, month0: number): string {
  return new Date(Date.UTC(year, month0, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}
