/** One create session must map to exactly one listing identity. */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isListingUuid(id: string | null | undefined): boolean {
  return typeof id === 'string' && UUID_RE.test(id.trim());
}

export function newListingCreationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const n = Math.floor(Math.random() * 16);
    const v = ch === 'x' ? n : (n & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type ListingPersistIntent = 'insert' | 'update';

export function listingPersistIntent(canonicalId: string | null | undefined): ListingPersistIntent {
  return canonicalId && canonicalId.trim() ? 'update' : 'insert';
}

export function adoptCanonicalListingId(
  current: string | null | undefined,
  persistedId: string
): string {
  const existing = current?.trim();
  if (existing) return existing;
  return persistedId;
}

/** After first persist, the address bar must point at the canonical listing — not create=. */
export function listingEditorSearchAfterFirstPersist(
  current: URLSearchParams,
  listingId: string
): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  next.delete('create');
  next.delete('new');
  next.set('edit', listingId);
  return next;
}

export function listingEditorPathAfterFirstPersist(pathname: string, listingId: string, search: string): string {
  const params = listingEditorSearchAfterFirstPersist(new URLSearchParams(search.replace(/^\?/, '')), listingId);
  const q = params.toString();
  return q ? `${pathname}?${q}` : `${pathname}?edit=${encodeURIComponent(listingId)}`;
}

export function shouldCloseListingEditorAfterSave(reason: 'draft' | 'published' | 'cancel'): boolean {
  return reason === 'cancel';
}

/**
 * Create sessions that later receive a canonical id must keep in-progress form state.
 * Re-hydrating from the listings array would look like a new edit and can reset the wizard.
 */
export function shouldHydrateExistingListing(input: {
  sessionOpenedAsCreate: boolean;
  editingId: string | null;
  alreadyHydratedId: string | null;
}): boolean {
  if (!input.editingId) return false;
  if (input.alreadyHydratedId === input.editingId) return false;
  if (input.sessionOpenedAsCreate) return false;
  return true;
}

export function shouldResetWizardOnEditingIdChange(input: {
  sessionOpenedAsCreate: boolean;
  previousId: string | null | undefined;
  nextId: string | null;
}): boolean {
  if (input.sessionOpenedAsCreate && !input.previousId && input.nextId) return false;
  return input.previousId !== input.nextId;
}

type PersistRecord = { id: string };

export async function runCanonicalListingPersist<T extends PersistRecord>(input: {
  canonicalId: string | null | undefined;
  insert: () => Promise<T>;
  update: (id: string) => Promise<T>;
}): Promise<{ record: T; created: boolean }> {
  const id = input.canonicalId?.trim() || '';
  if (id) {
    const record = await input.update(id);
    return { record, created: false };
  }
  const record = await input.insert();
  return { record, created: true };
}

/** Serialize persist calls so a second Save/visibility-flush cannot insert while the first insert is in flight. */
export function createListingPersistGate() {
  let chain: Promise<unknown> = Promise.resolve();
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      const next = chain.then(fn, fn);
      chain = next.then(
        () => undefined,
        () => undefined
      );
      return next;
    },
  };
}

export async function persistThroughGateTwiceForRegression<T extends PersistRecord>(input: {
  gate: ReturnType<typeof createListingPersistGate>;
  canonical: { current: string | null };
  insert: () => Promise<T>;
  update: (id: string) => Promise<T>;
}): Promise<[{ record: T; created: boolean }, { record: T; created: boolean }]> {
  const first = input.gate.run(() =>
    runCanonicalListingPersist({
      canonicalId: input.canonical.current,
      insert: input.insert,
      update: input.update,
    }).then((result) => {
      input.canonical.current = adoptCanonicalListingId(input.canonical.current, result.record.id);
      return result;
    })
  );
  const second = input.gate.run(() =>
    runCanonicalListingPersist({
      canonicalId: input.canonical.current,
      insert: input.insert,
      update: input.update,
    }).then((result) => {
      input.canonical.current = adoptCanonicalListingId(input.canonical.current, result.record.id);
      return result;
    })
  );
  return Promise.all([first, second]);
}
