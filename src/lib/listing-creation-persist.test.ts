import { describe, expect, it, vi } from 'vitest';
import {
  adoptCanonicalListingId,
  createListingPersistGate,
  isListingUuid,
  listingEditorPathAfterFirstPersist,
  listingPersistIntent,
  persistThroughGateTwiceForRegression,
  runCanonicalListingPersist,
  shouldCloseListingEditorAfterSave,
  shouldHydrateExistingListing,
  shouldResetWizardOnEditingIdChange,
} from './listing-creation-persist';

describe('canonical listing persist intent', () => {
  it('inserts only before a listing id exists, then updates that id', () => {
    expect(listingPersistIntent(null)).toBe('insert');
    expect(listingPersistIntent('')).toBe('insert');
    expect(listingPersistIntent('35f16471-17be-4500-8375-66b10efb6e4c')).toBe('update');
  });

  it('never replaces an adopted id with a later generated id', () => {
    expect(adoptCanonicalListingId('aaa', 'bbb')).toBe('aaa');
    expect(adoptCanonicalListingId(null, 'bbb')).toBe('bbb');
  });
});

describe('create → canonical URL', () => {
  it('replaces create=tour with edit=canonical so reload cannot start a second insert', () => {
    expect(
      listingEditorPathAfterFirstPersist('/partner/listings', 'abc-1', '?create=tour')
    ).toBe('/partner/listings?edit=abc-1');
    expect(
      listingEditorPathAfterFirstPersist('/partner/listings', 'abc-1', '?create=tour&filter=draft')
    ).toBe('/partner/listings?filter=draft&edit=abc-1');
  });
});

describe('create → edit session continuity', () => {
  it('keeps the overlay open after a draft persist', () => {
    expect(shouldCloseListingEditorAfterSave('draft')).toBe(false);
    expect(shouldCloseListingEditorAfterSave('published')).toBe(false);
    expect(shouldCloseListingEditorAfterSave('cancel')).toBe(true);
  });

  it('does not re-hydrate a create session when the canonical id arrives', () => {
    expect(
      shouldHydrateExistingListing({
        sessionOpenedAsCreate: true,
        editingId: 'abc-1',
        alreadyHydratedId: null,
      })
    ).toBe(false);
    expect(
      shouldHydrateExistingListing({
        sessionOpenedAsCreate: false,
        editingId: 'abc-1',
        alreadyHydratedId: null,
      })
    ).toBe(true);
  });

  it('does not reset wizard steps when create adopts a canonical id', () => {
    expect(
      shouldResetWizardOnEditingIdChange({
        sessionOpenedAsCreate: true,
        previousId: null,
        nextId: 'abc-1',
      })
    ).toBe(false);
    expect(
      shouldResetWizardOnEditingIdChange({
        sessionOpenedAsCreate: false,
        previousId: null,
        nextId: 'abc-1',
      })
    ).toBe(true);
  });
});

describe('duplicate listing regression', () => {
  it('runs insert once when two persists race before a canonical id exists', async () => {
    const inserts: string[] = [];
    const updates: string[] = [];
    let seq = 0;
    const gate = createListingPersistGate();
    const canonical = { current: null as string | null };

    const insert = vi.fn(async () => {
      seq += 1;
      const id = `listing-${seq}`;
      inserts.push(id);
      await Promise.resolve();
      return { id };
    });
    const update = vi.fn(async (id: string) => {
      updates.push(id);
      return { id };
    });

    const [a, b] = await persistThroughGateTwiceForRegression({
      gate,
      canonical,
      insert,
      update,
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(inserts).toEqual(['listing-1']);
    expect(updates).toEqual(['listing-1']);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(a.record.id).toBe('listing-1');
    expect(b.record.id).toBe('listing-1');
    expect(canonical.current).toBe('listing-1');
  });

  it('updates when a canonical id is already known', async () => {
    const insert = vi.fn(async () => ({ id: 'new' }));
    const update = vi.fn(async (id: string) => ({ id }));
    const result = await runCanonicalListingPersist({
      canonicalId: 'existing',
      insert,
      update,
    });
    expect(insert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith('existing');
    expect(result.created).toBe(false);
    expect(result.record.id).toBe('existing');
  });
});

describe('listing uuid', () => {
  it('accepts canonical UUIDs and rejects generated local placeholder ids', () => {
    expect(isListingUuid('35f16471-17be-4500-8375-66b10efb6e4c')).toBe(true);
    expect(isListingUuid('supplier-1710000000-abc')).toBe(false);
  });
});
