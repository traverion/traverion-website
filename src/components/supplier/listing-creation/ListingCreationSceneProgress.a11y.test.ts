import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer C: guided scene steppers must name the active wizard (basics vs option setup),
 * not a hardcoded "Basics scenes" label on every flow.
 */
describe('ListingCreationSceneProgress accessible naming', () => {
  it('uses a caller-provided aria-label on the scene list', () => {
    const progress = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'ListingCreationSceneProgress.tsx'),
      'utf8'
    );
    expect(progress).toMatch(/ariaLabel: string/);
    expect(progress).toMatch(/aria-label=\{ariaLabel\}/);
    expect(progress).not.toMatch(/aria-label="Basics scenes"/);
  });

  it('passes distinct labels from tour basics and option setup frames', () => {
    const basics = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'TourBasicsGuidedScenes.tsx'),
      'utf8'
    );
    const option = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'TourOptionGuidedScenes.tsx'),
      'utf8'
    );
    expect(basics).toMatch(/sceneProgressAriaLabel="Tour basics scenes"/);
    expect(option).toMatch(/sceneProgressAriaLabel="Option setup scenes"/);
  });
});
