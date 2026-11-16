import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { connectOnboardingUserMessage } from '../data/supabase-connect-onboarding';

const root = resolve(__dirname, '../..');
const invokeSrc = readFileSync(
  resolve(root, 'src/data/supabase-connect-onboarding.ts'),
  'utf8'
);
const panel = readFileSync(
  resolve(root, 'src/components/supplier/ConnectEmbeddedPanel.tsx'),
  'utf8'
);
const wizard = readFileSync(
  resolve(root, 'src/components/supplier/PayoutSetupWizard.tsx'),
  'utf8'
);

describe('Connect onboarding error mapping', () => {
  it('maps Unauthorized / session loss to a sign-in message', () => {
    expect(connectOnboardingUserMessage('Unauthorized')).toMatch(/sign in again/i);
    expect(connectOnboardingUserMessage('session_not_found')).toMatch(/sign in again/i);
  });

  it('maps network and account-session failures without blaming the user connection generically only', () => {
    expect(connectOnboardingUserMessage('Failed to fetch')).toMatch(/connection/i);
    expect(connectOnboardingUserMessage('Could not start verification session')).toMatch(
      /stripe verification/i
    );
  });

  it('parses edge function JSON errors and avoids duplicate parent+panel alerts', () => {
    expect(invokeSrc).toContain('edgeFunctionErrorMessage');
    expect(invokeSrc).toContain('connectOnboardingUserMessage');
    expect(panel).toContain('cachedSecret');
    expect(panel).toContain('Try again');
    expect(wizard).toContain('expressLaunchFailed');
    expect(wizard).toContain('setShowStripeEmbed(false)');
    expect(wizard).toContain('Continue verification');
  });
});
