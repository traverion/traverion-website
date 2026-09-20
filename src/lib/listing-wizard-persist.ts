/** Partner listing wizard header — only claim a save after a real persist attempt. */

export function listingWizardPersistLabel(input: {
  saving: boolean;
  failed: boolean;
  dirty: boolean;
  serverSaved: boolean;
  published?: boolean;
}): string | null {
  if (input.saving) return 'Saving…';
  if (input.failed) return 'Save failed';
  if (input.dirty) return 'Unsaved changes';
  if (input.serverSaved) return input.published ? 'Saved' : 'Draft saved';
  return null;
}
