import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('tour option creation overhaul (source contracts)', () => {
  const css = read('../../../index.css');

  it('applies choice-card selected borders in the option shell and schedule workspace', () => {
    expect(css).toMatch(/\.listing-creation-option-shell \.lc-choice--selected/);
    expect(css).toMatch(/\.listing-creation-schedule-workspace \.lc-choice--selected/);
  });

  it('shares lc-section / lc-tile styling outside .listing-creation-workspace', () => {
    expect(css).toMatch(/:is\(\.listing-creation-workspace, \.listing-creation-option-shell[^)]*\) \.lc-section/);
    expect(css).toMatch(/:is\(\.listing-creation-workspace, \.listing-creation-option-shell[^)]*\) \.lc-tile/);
  });

  it('keeps the schedule layer fixed above the creation shell (z-80)', () => {
    const block = css.slice(css.indexOf('.listing-creation-schedule-layer {'));
    expect(block.slice(0, 200)).toContain('position: fixed');
    expect(block.slice(0, 200)).toMatch(/z-index: (9\d|1\d\d)/);
  });

  it('portals the schedule workspace to document.body', () => {
    const src = read('TourScheduleWorkspace.tsx');
    expect(src).toContain('createPortal(layer, document.body)');
    expect(src).toContain('Back to option');
  });

  it('imports the schedule prerequisite check used by Add schedule', () => {
    const form = readFileSync(resolve(__dirname, '../../../pages/supplier/SupplierListingForm.tsx'), 'utf8');
    expect(form).toMatch(/import \{[^}]*bookingOptionSchedulePrereqIssues[^}]*\} from '..\/..\/lib\/listing-option-validation'/s);
    expect(form).toContain('<TourOptionCard');
  });

  it('shows Tour → Option → Scene context and Back to options in the option header', () => {
    const src = read('TourOptionWorkspace.tsx');
    expect(src).toContain('Back to options');
    expect(src).toContain('aria-label="Where you are"');
  });
});
