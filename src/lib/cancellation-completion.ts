/**
 * Show cancellation success when the booking, inventory, and refund work
 * has finished. Queue acknowledgement happens after that, and provider
 * delivery is not part of this function.
 */
export type CancellationCompletionPhase = 'success' | 'partial' | 'failure';

export type CancellationNotice = 'queued' | 'failed' | 'none';

export async function presentCancellationCompletion<T extends { phase: CancellationCompletionPhase }>(args: {
  settle: () => Promise<T>;
  onSettled: (result: T) => void;
  queue?: (result: T) => Promise<{ notice: CancellationNotice; rows?: unknown }>;
  onQueued?: (update: { notice: CancellationNotice; rows?: unknown }) => void;
}): Promise<void> {
  const settled = await args.settle();
  args.onSettled(settled);
  if (settled.phase === 'failure' || !args.queue) return;
  try {
    const update = await args.queue(settled);
    args.onQueued?.(update);
  } catch {
    args.onQueued?.({ notice: 'failed' });
  }
}
