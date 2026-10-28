/**
 * What's included / Restrictions + Rental rules polish.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  rentalRestrictionSuggestions,
  rentalRulesSuggestions,
} from '../../../lib/rental-categories';
import { RENTAL_ONBOARDING_SCREENS, rentalScreenIndex } from '../../../lib/rental-onboarding';

const here = dirname(fileURLToPath(import.meta.url));
const flowSrc = readFileSync(join(here, 'RentalOnboardingFlow.tsx'), 'utf8');
const categoriesSrc = readFileSync(
  join(here, '../../../lib/rental-categories.ts'),
  'utf8',
);

describe('rental inclusions and rules polish', () => {
  it('separates included and restricted sections with instant suggestion add', () => {
    expect(flowSrc).toContain('rental-inclusions-screen');
    expect(flowSrc).toContain('title="What\'s included"');
    expect(flowSrc).toContain('title="Restrictions"');
    expect(flowSrc).toContain('rental-chip-editor');
    expect(flowSrc).toContain('function ChipEditor');
    expect(flowSrc).toContain('const addItem =');
    expect(flowSrc).toContain('const removeItem =');
    expect(flowSrc).toContain("if (e.key === 'Enter')");
    expect(flowSrc).toContain('has(value)');
    expect(flowSrc).not.toContain('emptyHelp');
    expect(rentalRestrictionSuggestions('bikes').length).toBeGreaterThan(0);
    expect(rentalRestrictionSuggestions('vehicles')).toEqual(
      expect.arrayContaining(['No use outside permitted areas']),
    );
  });

  it('keeps a premium optional rules textarea with insert-only suggestions', () => {
    expect(RENTAL_ONBOARDING_SCREENS[rentalScreenIndex('rules')].title).toBe('Rental rules');
    expect(flowSrc).toContain('rental-rules-stage');
    expect(flowSrc).toContain('rentalRulesSuggestions');
    expect(flowSrc).toContain('insertSuggestion');
    expect(flowSrc).toContain('rental-rules-stage__counter');
    expect(flowSrc).toContain('RENTAL_RULES_MAX');
    expect(flowSrc).not.toMatch(
      /Cover permitted use, return condition, cleaning, damage reporting/,
    );
    expect(categoriesSrc).toContain('export function rentalRulesSuggestions');
    const bikeRules = rentalRulesSuggestions('bikes');
    expect(bikeRules.some((line) => /return/i.test(line))).toBe(true);
    expect(bikeRules.some((line) => /damage|late/i.test(line))).toBe(true);
    expect(rentalRulesSuggestions('vehicles').some((line) => /fuel|route|briefing/i.test(line))).toBe(
      true,
    );
  });
});
