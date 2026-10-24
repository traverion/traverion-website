/**
 * In-Trips (and reusable) traveler review compose dialog.
 * Submits via existing submitReview + RLS (paid completed booking required).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Star, X } from 'lucide-react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import NoticeCallout from './NoticeCallout';
import { submitReview, userHasReviewedListing } from '../data/supabase-reviews';
import { supabase } from '../lib/supabase';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { travelerDisplayNameFromSources } from '../lib/traveler-display-name';

export type TravelerReviewTarget = {
  bookingId: string;
  listingId: string;
  listingTitle: string;
  imageUrl?: string | null;
  mode: 'write' | 'edit';
};

type Props = {
  open: boolean;
  target: TravelerReviewTarget | null;
  userId: string;
  userMetadata?: Record<string, unknown> | null;
  profileDisplayName?: string | null;
  onClose: () => void;
  onSubmitted: (listingId: string) => void;
};

export default function TravelerReviewComposeDialog({
  open,
  target,
  userId,
  userMetadata,
  profileDisplayName,
  onClose,
  onSubmitted,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(false);

  useDialogFocus(open && Boolean(target), panelRef, () => {
    if (!submitting) onClose();
  });

  useEffect(() => {
    if (!open || !target) return;
    setError(null);
    setSubmitting(false);
    let cancelled = false;
    setHydrating(true);
    void (async () => {
      try {
        if (!supabase || target.mode !== 'edit') {
          if (!cancelled) {
            setRating(5);
            setTitle('');
            setComment('');
          }
          return;
        }
        const { data, error: qErr } = await supabase
          .from('reviews')
          .select('rating, title, comment')
          .eq('user_id', userId)
          .eq('listing_id', target.listingId)
          .maybeSingle();
        if (cancelled) return;
        if (qErr) throw new Error(qErr.message);
        if (data) {
          setRating(Number(data.rating) || 5);
          setTitle((data.title ?? '').trim());
          setComment((data.comment ?? '').trim());
        } else {
          setRating(5);
          setTitle('');
          setComment('');
        }
      } catch (e) {
        if (!cancelled) {
          setError(userFacingError(e instanceof Error ? e.message : String(e), USER_ERROR.review));
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, target, userId]);

  if (!open || !target) return null;

  const guestName = travelerDisplayNameFromSources({
    profileDisplayName: profileDisplayName ?? null,
    metadata: userMetadata as {
      full_name?: string;
      name?: string;
      customer_first_name?: string;
      customer_last_name?: string;
    } | null,
  });

  const submit = async () => {
    const trimmed = comment.trim();
    if (!trimmed) {
      setError('Please write a short review before submitting.');
      return;
    }
    if (rating < 1 || rating > 5) {
      setError('Choose a rating from 1 to 5 stars.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Soft duplicate guard for write mode (upsert still safe).
      if (target.mode === 'write') {
        const already = await userHasReviewedListing(userId, target.listingId);
        if (already) {
          onSubmitted(target.listingId);
          onClose();
          return;
        }
      }
      const res = await submitReview({
        listingId: target.listingId,
        userId,
        guestName,
        rating,
        title: title.trim() || undefined,
        comment: trimmed,
        bookingId: target.bookingId,
      });
      if (!res.success) {
        setError(userFacingError(res.error, USER_ERROR.review));
        return;
      }
      onSubmitted(target.listingId);
      onClose();
    } catch (e) {
      setError(userFacingError(e instanceof Error ? e.message : String(e), USER_ERROR.review));
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="tv-sheet-overlay tv-sheet-overlay--portal z-[80]">
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0"
        aria-label="Close"
        onClick={() => !submitting && onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="tv-traveler-review-dialog relative z-[81] mx-auto w-full max-w-[26rem] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/[0.08] motion-safe:animate-slide-up sm:motion-safe:animate-none"
      >
        <div className="flex items-start gap-3 border-b border-black/[0.06] px-4 py-3.5">
          {target.imageUrl ? (
            <img
              src={target.imageUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg object-cover bg-black/[0.04]"
              width={48}
              height={48}
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#073b83]/[0.06]" aria-hidden>
              <Star className="h-5 w-5 text-[#073b83]/60" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[1.05rem] font-semibold tracking-tight text-[#0c1118]">
              {target.mode === 'edit' ? 'Your review' : 'Write a review'}
            </h2>
            <p className="mt-0.5 truncate text-[13px] text-[#5a6472]" title={target.listingTitle}>
              {target.listingTitle}
            </p>
          </div>
          <button
            type="button"
            className="tv-btn-ghost -mr-1 inline-flex h-9 w-9 items-center justify-center rounded-lg p-0"
            onClick={() => !submitting && onClose()}
            aria-label="Close review"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          {hydrating ? (
            <p className="text-[13px] text-[#5a6472]">Loading your review…</p>
          ) : (
            <>
              <div>
                <p id={`${titleId}-rating`} className="mb-1.5 text-[13px] font-medium text-[#0c1118]">
                  Rating
                </p>
                <div className="flex gap-0.5" role="group" aria-labelledby={`${titleId}-rating`}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setRating(i)}
                      className="lux-tap-target inline-flex min-h-11 min-w-11 items-center justify-center p-0.5"
                      aria-label={`Rate ${i} out of 5 stars`}
                      aria-pressed={i <= rating}
                    >
                      <Star
                        size={26}
                        className={i <= rating ? 'fill-[#073b83] text-[#073b83]' : 'text-[#c4c9d1]'}
                        aria-hidden
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor={`${titleId}-title`} className="mb-1 block text-[13px] font-medium text-[#0c1118]">
                  Title <span className="font-normal text-[#8892a0]">(optional)</span>
                </label>
                <input
                  id={`${titleId}-title`}
                  type="text"
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="tv-input w-full text-[13px]"
                  placeholder="Sum up your experience"
                />
              </div>
              <div>
                <label htmlFor={`${titleId}-comment`} className="mb-1 block text-[13px] font-medium text-[#0c1118]">
                  Your review
                </label>
                <textarea
                  id={`${titleId}-comment`}
                  rows={4}
                  maxLength={2000}
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 2000))}
                  className="tv-input min-h-[6.5rem] w-full resize-y text-[13px] leading-relaxed"
                  placeholder="Tell others what stood out…"
                  required
                  aria-describedby={`${titleId}-hint`}
                />
                <p id={`${titleId}-hint`} className="mt-1 text-[11px] text-[#8892a0]">
                  Up to 2000 characters{comment.length > 0 ? ` · ${comment.length} used` : ''}.
                </p>
              </div>
            </>
          )}

          {error ? (
            <NoticeCallout title="Could not submit review" tone="danger">
              {error}
            </NoticeCallout>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-0.5">
            <button
              type="button"
              className="tv-btn-ghost h-10 px-3 text-[13px]"
              disabled={submitting}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="tv-btn-primary h-10 min-w-[8.5rem] px-4 text-[13px] disabled:opacity-55"
              disabled={submitting || hydrating || !comment.trim()}
              aria-busy={submitting || undefined}
              onClick={() => void submit()}
            >
              {submitting ? 'Submitting…' : target.mode === 'edit' ? 'Save review' : 'Submit review'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
