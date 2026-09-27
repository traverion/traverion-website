/**
 * Map a Supabase-style query result to rows, throwing on error so callers
 * cannot treat infrastructure failure as an empty legitimate result set.
 */
export function queryRowsOrThrow<T>(
  data: T[] | null | undefined,
  error: { message: string } | null | undefined
): T[] {
  if (error) throw new Error(error.message);
  return data ?? [];
}
