import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(`src/${rel}`, 'utf8');

describe('P9.48 onboarding stability', () => {
  it('does not push embedded payout step → shell phase on every draft change', () => {
    const wizard = read('components/supplier/PayoutSetupWizard.tsx');
    // Bidirectional sync was the blank/flash root cause.
    expect(wizard).toContain('Parent shell owns phase/URL');
    expect(wizard).not.toMatch(
      /if \(embedded\) \{\s*if \(draft\.step === 'bank'[\s\S]*?onUnifiedPhaseChange\?\.\('payout'\)/
    );
  });

  it('does not push embedded business step → shell phase on every draft change', () => {
    const biz = read('components/supplier/BusinessOnboardingWizard.tsx');
    expect(biz).toContain('Do not push step → phase');
    expect(biz).toMatch(/if \(embedded\) return;/);
  });

  it('stabilizes shell phase callbacks and expands content canvas', () => {
    const shell = read('pages/supplier/PartnerOnboarding.tsx');
    expect(shell).toContain('handlePayoutPhaseChange');
    expect(shell).toContain('handleBusinessPhaseChange');
    expect(shell).toContain('partner-unified-setup-canvas');
    expect(shell).toContain("unifiedPhase={phase === 'representative' || phase === 'payout' ? phase : 'payout'}");
    // Eager imports avoid Suspense blank frames when switching business ↔ payout.
    expect(shell).not.toMatch(/lazy\(\s*\(\)\s*=>\s*import\('\.\.\/\.\.\/components\/supplier\/PayoutSetupWizard'\)/);
    expect(shell).toContain("import PayoutSetupWizard from '../../components/supplier/PayoutSetupWizard'");
  });

  it('centers desktop content beyond the old 40rem column', () => {
    const css = readFileSync('src/index.css', 'utf8');
    expect(css).toContain('.partner-unified-setup-canvas');
    expect(css).toMatch(/max-width:\s*min\(72rem/);
  });
});
