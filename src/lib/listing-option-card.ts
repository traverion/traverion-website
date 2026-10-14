/**
 * Option card truth for the tour Options step.
 *
 * Derives structured status rows (duration, pricing, meeting, availability) and the primary CTA
 * from the same validation helpers the option wizard uses. No new persistence or requirements.
 */

import type { ListingBookingOption, ListingOptionSchedule } from '../types/listingExtras';
import { getListingBookingOptionDurationIssue } from '../types/listingExtras';
import {
  formatScheduleRange,
  listingOptionHasSchedules,
  listingOptionReadySchedules,
  listingOptionSchedules,
} from './listing-option-schedules';
import { optionHeadlineUnitPrice } from './price-categories';
import {
  bookingOptionMeetingIssues,
  bookingOptionPricingSceneIssues,
  bookingOptionSetupIssues,
} from './listing-option-validation';

export type TourOptionCardRowId = 'duration' | 'pricing' | 'meeting' | 'availability';

export type TourOptionCardRow = {
  id: TourOptionCardRowId;
  label: string;
  ok: boolean;
  /** Human value when ok, otherwise the next thing to do. */
  text: string;
};

export type TourOptionCardCta =
  | { kind: 'continue_setup'; label: string; sceneIndex: number; reason: string }
  | { kind: 'add_schedule'; label: string; sceneIndex: number; reason: string }
  | { kind: 'finish_schedule'; label: string; sceneIndex: number; reason: string; scheduleId: string }
  | { kind: 'manage_schedules'; label: string; sceneIndex: number; reason: string }
  | { kind: 'none' };

export type TourOptionCardModel = {
  rows: TourOptionCardRow[];
  /** Short missing-items summary, e.g. "Missing: meeting, schedule". Null when nothing is missing. */
  missingSummary: string | null;
  /** Configuration status for the card header — e.g. Configured, Schedule required. Not live/published. */
  statusLabel: string;
  cta: TourOptionCardCta;
  readySchedules: number;
  draftSchedules: number;
};

function chargeModelChosen(option: ListingBookingOption): boolean {
  return option.chargeModel === 'per_person' || option.chargeModel === 'flat_group';
}

function isWholeGroupPricing(option: ListingBookingOption): boolean {
  return (
    option.chargeModel === 'flat_group' ||
    (option.isPrivate === true && option.privatePricing === 'flat_group')
  );
}

function pricingText(
  option: ListingBookingOption,
  ready: ListingOptionSchedule[],
  formatAmount: (n: number) => string
): { ok: boolean; text: string } {
  if (!chargeModelChosen(option)) {
    return { ok: false, text: 'Choose per person or per group' };
  }
  const wholeGroup = isWholeGroupPricing(option);
  // Charge model lives on the option; amounts live on schedules. Do not mark pricing
  // incomplete merely because a schedule is still missing — Availability owns that gap.
  if (ready.length === 0) {
    return { ok: true, text: wholeGroup ? 'Whole group' : 'Per person' };
  }
  const prices = ready.map((s) => optionHeadlineUnitPrice(s)).filter((n) => n > 0);
  if (prices.length === 0) {
    return { ok: false, text: wholeGroup ? 'Set schedule group price' : 'Set schedule prices' };
  }
  const min = Math.min(...prices);
  const amount = formatAmount(min);
  if (wholeGroup) {
    const allSame = prices.every((p) => p === min);
    return { ok: true, text: allSame ? `${amount} / group` : `From ${amount} / group` };
  }
  return { ok: true, text: `From ${amount} / person` };
}

function meetingText(option: ListingBookingOption): { ok: boolean; text: string } {
  const issues = bookingOptionMeetingIssues(option);
  if (issues.length > 0) return { ok: false, text: issues[0] ?? 'Add meeting details' };
  const place = option.pickupPlace.trim();
  const prefix =
    option.fulfillment === 'pickup' ? 'Pickup' : option.fulfillment === 'meeting_point' ? 'Meeting point' : 'Meet';
  return { ok: true, text: `${prefix} · ${place}` };
}

function availabilityText(
  ready: ListingOptionSchedule[],
  draftCount: number
): { ok: boolean; text: string } {
  if (ready.length === 0) {
    if (draftCount > 0) {
      return {
        ok: false,
        text: draftCount === 1 ? '1 draft schedule' : `${draftCount} draft schedules`,
      };
    }
    return { ok: false, text: 'None yet' };
  }
  const froms = ready.map((s) => s.availabilityDateFrom).filter(Boolean).sort();
  const tos = ready.map((s) => s.availabilityDateTo).filter(Boolean).sort();
  const range = formatScheduleRange(froms[0] ?? '', tos.length === ready.length ? (tos[tos.length - 1] ?? '') : '');
  const count = ready.length === 1 ? '1 schedule' : `${ready.length} schedules`;
  return { ok: true, text: range ? `${count} · ${range}` : count };
}

export function tourOptionCardModel(
  option: ListingBookingOption,
  formatAmount: (n: number) => string
): TourOptionCardModel {
  const all = listingOptionHasSchedules(option) ? option.schedules ?? [] : listingOptionSchedules(option);
  const ready = listingOptionReadySchedules(option);
  const draftSchedules = Math.max(0, all.length - ready.length);

  const durationIssue = getListingBookingOptionDurationIssue(option.duration);
  const duration: TourOptionCardRow = {
    id: 'duration',
    label: 'Duration',
    ok: !durationIssue && option.duration.trim().length > 0,
    text: !durationIssue && option.duration.trim() ? option.duration.trim() : 'Add how long it runs',
  };
  const pricing = pricingText(option, ready, formatAmount);
  const meeting = meetingText(option);
  const availability = availabilityText(ready, draftSchedules);

  const rows: TourOptionCardRow[] = [
    duration,
    { id: 'meeting', label: 'Meeting', ...meeting },
    { id: 'pricing', label: 'Pricing', ...pricing },
    { id: 'availability', label: 'Availability', ...availability },
  ];

  const missingLabels: string[] = [];
  if (!duration.ok) missingLabels.push('duration');
  if (!pricing.ok) missingLabels.push('pricing');
  if (!meeting.ok) missingLabels.push('meeting');
  if (!availability.ok) missingLabels.push('schedule');

  const setupIssues = bookingOptionSetupIssues(option);
  const meetingIssues = bookingOptionMeetingIssues(option);
  const pricingIssues = bookingOptionPricingSceneIssues(option);

  let cta: TourOptionCardCta = { kind: 'none' };
  if (setupIssues.length > 0) {
    cta = {
      kind: 'continue_setup',
      label: 'Continue setup',
      sceneIndex: 0,
      reason: setupIssues[0] ?? 'Finish option setup.',
    };
  } else if (meetingIssues.length > 0) {
    cta = {
      kind: 'continue_setup',
      label: 'Continue setup',
      sceneIndex: 1,
      reason: meetingIssues[0] ?? 'Finish meeting details.',
    };
  } else if (pricingIssues.length > 0) {
    cta = {
      kind: 'continue_setup',
      label: 'Continue setup',
      sceneIndex: 2,
      reason: pricingIssues[0] ?? 'Finish pricing.',
    };
  } else if (ready.length === 0) {
    const draft = all.find((s) => s.status === 'draft') ?? all[0];
    if (draft && all.length > 0) {
      cta = {
        kind: 'finish_schedule',
        label: 'Finish schedule',
        sceneIndex: 3,
        reason: 'A draft schedule is not bookable until its dates, days, price and capacity are complete.',
        scheduleId: draft.id,
      };
    } else {
      cta = {
        kind: 'add_schedule',
        label: 'Add schedule',
        sceneIndex: 3,
        reason: 'Travelers can only book dates that come from a ready schedule.',
      };
    }
  } else {
    cta = {
      kind: 'manage_schedules',
      label: 'Schedules',
      sceneIndex: 3,
      reason: 'Edit schedules for this option.',
    };
  }

  // Configuration readiness only — not published / currently bookable.
  let statusLabel = 'Configured';
  if (cta.kind === 'add_schedule') statusLabel = 'Schedule required';
  else if (cta.kind === 'finish_schedule') statusLabel = 'Schedule incomplete';
  else if (cta.kind === 'continue_setup') {
    if (cta.sceneIndex === 1) statusLabel = 'Meeting required';
    else if (cta.sceneIndex === 2) statusLabel = 'Pricing required';
    else statusLabel = 'Setup required';
  } else if (cta.kind === 'manage_schedules') {
    statusLabel = 'Configured';
  } else if (missingLabels.length > 0) {
    statusLabel = 'Setup required';
  }

  return {
    rows,
    missingSummary: missingLabels.length > 0 ? `Missing: ${missingLabels.join(', ')}` : null,
    statusLabel,
    cta,
    readySchedules: ready.length,
    draftSchedules,
  };
}

/** Why Add schedule is blocked, written for the supplier (not a validation code). */
export function scheduleBlockedExplanation(prereqIssues: string[]): string | null {
  if (prereqIssues.length === 0) return null;
  return `Schedules depend on Pricing (per person or per group) and Setup (fixed start time or flexible hours). ${prereqIssues.join(' ')}`;
}
