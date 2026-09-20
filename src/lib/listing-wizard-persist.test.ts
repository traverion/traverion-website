import { describe, expect, it } from 'vitest';
import { listingWizardPersistLabel } from './listing-wizard-persist';

describe('listingWizardPersistLabel', () => {
  it('does not claim saved for a new unsaved draft', () => {
    expect(
      listingWizardPersistLabel({
        saving: false,
        failed: false,
        dirty: false,
        serverSaved: false,
      })
    ).toBeNull();
  });

  it('prefers in-flight and failed persist over dirty/saved', () => {
    expect(
      listingWizardPersistLabel({
        saving: true,
        failed: true,
        dirty: true,
        serverSaved: true,
      })
    ).toBe('Saving…');
    expect(
      listingWizardPersistLabel({
        saving: false,
        failed: true,
        dirty: true,
        serverSaved: false,
      })
    ).toBe('Save failed');
  });

  it('distinguishes unsaved edits from a completed server draft', () => {
    expect(
      listingWizardPersistLabel({
        saving: false,
        failed: false,
        dirty: true,
        serverSaved: true,
      })
    ).toBe('Unsaved changes');
    expect(
      listingWizardPersistLabel({
        saving: false,
        failed: false,
        dirty: false,
        serverSaved: true,
      })
    ).toBe('Draft saved');
    expect(
      listingWizardPersistLabel({
        saving: false,
        failed: false,
        dirty: false,
        serverSaved: true,
        published: true,
      })
    ).toBe('Saved');
  });
});
