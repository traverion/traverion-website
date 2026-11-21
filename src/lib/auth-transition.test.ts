import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginAuthTransition,
  cancelAuthTransition,
  checkEmailAuthTransition,
  completeAuthTransition,
  continueAuthCheckEmail,
  dismissAuthTransition,
  failAuthTransition,
  markAuthTransitionNavigated,
  peekAuthTransition,
  resetAuthTransitionForTests,
  succeedAuthTransition,
} from './auth-transition';

describe('auth transition modal state', () => {
  afterEach(() => {
    resetAuthTransitionForTests();
  });

  it('keeps one pending transition and ignores a second start', () => {
    const first = beginAuthTransition({ intent: 'login', title: 'Signing you in...', message: 'Checking your account.' });
    const second = beginAuthTransition({ intent: 'login', title: 'Other', message: 'Other' });
    expect(second).toBe(first);
    expect(peekAuthTransition()?.title).toBe('Signing you in...');
  });

  it('does not show success before succeed, and navigates once', () => {
    const id = beginAuthTransition({ intent: 'login', title: 'Signing you in...', message: 'Checking your account.' });
    expect(peekAuthTransition()?.phase).toBe('pending');
    const navigate = vi.fn();
    succeedAuthTransition(id, {
      title: 'Welcome back!',
      message: "You're signed in.",
      page: 'bookings',
      navigate,
    });
    expect(peekAuthTransition()?.phase).toBe('success');
    expect(navigate).not.toHaveBeenCalled();
    markAuthTransitionNavigated(id);
    markAuthTransitionNavigated(id);
    expect(navigate).toHaveBeenCalledTimes(1);
    completeAuthTransition(id);
    expect(peekAuthTransition()).toBeNull();
  });

  it('does not dismiss a spinner, and does dismiss an error so the form can be retried', () => {
    const id = beginAuthTransition({ intent: 'signup', title: 'Creating your account...', message: 'Setting things up.' });
    dismissAuthTransition();
    expect(peekAuthTransition()?.phase).toBe('pending');
    failAuthTransition(id, 'Incorrect email or password.');
    expect(peekAuthTransition()?.phase).toBe('error');
    expect(peekAuthTransition()?.message).toBe('Incorrect email or password.');
    dismissAuthTransition();
    expect(peekAuthTransition()).toBeNull();
  });

  it('uses check-email without marking the account active', () => {
    const id = beginAuthTransition({ intent: 'signup', title: 'Creating your account...', message: 'Setting things up.' });
    const go = vi.fn();
    checkEmailAuthTransition(id, {
      title: 'Check your email',
      message: 'Open the confirmation link for this address. The account is not active until you do.',
      email: 'owner@example.com',
      actionLabel: 'Continue to login',
      onContinue: go,
    });
    const state = peekAuthTransition();
    expect(state?.phase).toBe('check-email');
    expect(state?.email).toBe('owner@example.com');
    expect(state?.message.toLowerCase()).not.toContain('ready');
    continueAuthCheckEmail();
    expect(go).toHaveBeenCalledTimes(1);
    expect(peekAuthTransition()).toBeNull();
  });

  it('closes the spinner for an unverified login so the form can explain it', () => {
    const id = beginAuthTransition({ intent: 'login', title: 'Signing you in...', message: 'Checking your account.' });
    cancelAuthTransition(id);
    expect(peekAuthTransition()).toBeNull();
  });

  it('ignores a late failure after success', () => {
    const id = beginAuthTransition({ intent: 'logout', title: 'Signing you out...', message: 'Ending this session.' });
    succeedAuthTransition(id, {
      title: 'Successfully logged out.',
      message: 'See you on your next adventure.',
      page: 'home',
    });
    failAuthTransition(id, 'Network');
    expect(peekAuthTransition()?.phase).toBe('success');
    expect(peekAuthTransition()?.title).toBe('Successfully logged out.');
  });
});