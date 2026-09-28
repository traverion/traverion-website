import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer C: marketplace guest popover must not yank focus back to its trigger when the
 * traveler clicks another search field (Where / date) to dismiss the panel.
 */
describe('TravelerGuestPicker dialog focus', () => {
  it('uses shared dialog focus hook (restore guard lives in useDialogFocus)', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'TravelerGuestPicker.tsx'),
      'utf8'
    );
    expect(src).toMatch(/useDialogFocus\(open, panelRef, close\)/);
    const hook = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../hooks/useDialogFocus.ts'),
      'utf8'
    );
    expect(hook).toMatch(/shouldRestoreFocusAfterDialogClose/);
  });
});
