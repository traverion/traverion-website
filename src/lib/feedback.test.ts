import { describe, expect, it } from 'vitest';
import { peekAuthTransition, resetAuthTransitionForTests } from './auth-transition';
import { beginMilestone, failMilestone, succeedMilestone } from './feedback';
import { resetPartnerToastsForTests, toastDuration } from './partner-toast';
import { feedback } from './feedback';

describe('shared feedback', () => {
  it('keeps a warning on screen longer than a success', () => {
    expect(toastDuration('warning')).toBe(4500);
    expect(toastDuration('success')).toBe(3000);
  });

  it('does not show a milestone checkmark before the action is confirmed', () => {
    resetAuthTransitionForTests();
    const id = beginMilestone('Publishing your listing...', 'Saving it for travelers.');
    succeedMilestone(id, false, {
      title: 'Listing published',
      message: 'This listing is live for travelers.',
      page: 'partner',
    });
    expect(peekAuthTransition()?.phase).toBe('pending');
    expect(peekAuthTransition()?.title).toBe('Publishing your listing...');
    failMilestone(id, 'Could not save your listing. Please try again.');
    expect(peekAuthTransition()?.phase).toBe('error');
    resetAuthTransitionForTests();
    resetPartnerToastsForTests();
  });

  it('shows the checkmark after confirmation', () => {
    resetAuthTransitionForTests();
    const id = beginMilestone('Archiving supplier...', 'Revoking sign-in.');
    succeedMilestone(id, true, {
      title: 'Supplier archived',
      message: 'The record, agreement, and payout account stay in place.',
      page: 'admin',
    });
    expect(peekAuthTransition()?.phase).toBe('success');
    expect(peekAuthTransition()?.title).toBe('Supplier archived');
    resetAuthTransitionForTests();
  });

  it('publishes a warning through the shared toast', () => {
    resetPartnerToastsForTests();
    expect(feedback.warning('Saved, but the supplier email was not sent.')).toBeTruthy();
    resetPartnerToastsForTests();
  });
});
