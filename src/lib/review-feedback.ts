/** Written review content (not star-only). Shared by Reviews UI and Today attention. */
export function reviewHasWrittenFeedback(r: {
  title?: string | null;
  comment?: string | null;
}): boolean {
  const title = (r.title ?? '').trim();
  const comment = (r.comment ?? '').trim();
  return title.length > 0 || comment.length > 0;
}

/** Written review with no supplier reply row. */
export function reviewNeedsSupplierReply(
  r: { id: string; title?: string | null; comment?: string | null },
  repliesByReviewId: Record<string, unknown>
): boolean {
  return reviewHasWrittenFeedback(r) && !repliesByReviewId[r.id];
}
