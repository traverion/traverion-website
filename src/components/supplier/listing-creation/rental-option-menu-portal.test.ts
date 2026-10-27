import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const flowSrc = readFileSync(new URL('./RentalOnboardingFlow.tsx', import.meta.url), 'utf8');
const collectionSrc = readFileSync(new URL('./RentalCollectionPoint.tsx', import.meta.url), 'utf8');

describe('rental option action menu portal', () => {
  it('portals the three-dot menu to document.body with anchored positioning', () => {
    expect(flowSrc).toContain("from 'react-dom'");
    expect(flowSrc).toContain('createPortal');
    expect(flowSrc).toContain('computeAnchoredActionMenuBox');
    expect(flowSrc).toContain('document.body');
    expect(flowSrc).toContain('data-rental-option-menu');
    expect(flowSrc).toMatch(/align:\s*'end'/);
    expect(flowSrc).not.toMatch(/className="rental-option-card__menu"[\s\S]{0,80}absolute/);
  });

  it('closes on Escape and outside pointerdown', () => {
    expect(flowSrc).toContain("event.key === 'Escape'");
    expect(flowSrc).toContain("addEventListener('pointerdown'");
    expect(flowSrc).toContain('closeMenu');
  });

  it('flips rental address suggestion menus with the same anchored helper', () => {
    expect(collectionSrc).toContain('createPortal');
    expect(collectionSrc).toContain('computeAnchoredActionMenuBox');
    expect(collectionSrc).toMatch(/align:\s*'start'/);
  });
});
