/**
 * Helpers for listing editor save races.
 * Saves must not clobber edits typed while an async onSave is in flight.
 */

/** Sync only status onto the latest form after a successful save. */
export function applyListingSaveStatus<T extends { status: 'draft' | 'published' }>(
  current: T,
  targetStatus: 'draft' | 'published'
): T {
  if (current.status === targetStatus) return current;
  return { ...current, status: targetStatus };
}
