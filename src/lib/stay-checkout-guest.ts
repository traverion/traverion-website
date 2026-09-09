/** Stay checkout needs a lead guest name so the host can operate the arrival. */
export function stayCheckoutLeadGuestNameReady(name: string | null | undefined): boolean {
  return (name ?? '').trim().length >= 2;
}
