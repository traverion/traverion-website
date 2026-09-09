/**
 * Tour booking auth should wait until Stripe confirm — not block option pick or contact form.
 * Auth still required before createBookingCheckoutSession.
 */
export function tourBookingRequiresAuthBeforeStep(
  step: 'pick_option' | 'contact' | 'confirm_pay'
): boolean {
  return step === 'confirm_pay';
}
