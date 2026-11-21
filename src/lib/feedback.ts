import {
  beginAuthTransition,
  failAuthTransition,
  succeedAuthTransition,
} from './auth-transition';
import { partnerToast, type PartnerToastTone } from './partner-toast';

/**
 * One feedback vocabulary for traveler, partner, and admin.
 * Small reversible results use a toast. Confirmed milestones use the blue-checkmark modal.
 * The modal opens only after the caller has a server result to report.
 */
export const feedback = {
  success(message: string) {
    return partnerToast.success(message);
  },
  error(message: string) {
    return partnerToast.error(message);
  },
  warning(message: string) {
    return partnerToast.warning(message);
  },
  info(message: string) {
    return partnerToast.info(message);
  },
  dismiss: partnerToast.dismiss,
};

export type FeedbackTone = PartnerToastTone;

export function beginMilestone(title: string, message: string): number {
  return beginAuthTransition({ intent: 'setup', title, message });
}

/** Checkmark only when `confirmed` is true. A failed call must use failMilestone. */
export function succeedMilestone(
  id: number,
  confirmed: boolean,
  input: { title: string; message: string; page: string }
): void {
  if (!confirmed) return;
  succeedAuthTransition(id, input);
}

export function failMilestone(id: number, message: string): void {
  failAuthTransition(id, message);
}
