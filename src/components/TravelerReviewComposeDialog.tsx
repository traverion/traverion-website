/**
 * Multi-step traveler review journey (Trips).
 * Rate → optional comment → public identity → post → success.
 * Persists via existing submitReview + RLS (paid completed booking required).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, Star, X } from 'lucide-react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import NoticeCallout from './NoticeCallout';
import { submitReview, userHasReviewedListing } from '../data/supabase-reviews';
import { supabase } from '../lib/supabase';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { travelerDisplayNameFromSources } from '../lib/traveler-display-name';
import {
  normalizeReviewCommentForSubmit,
  publicReviewGuestName,
  ratingAdjective,
  REVIEW_COMMENT_MAX_CHARS,
  reviewIdentityFromRow,
  type ReviewIdentityChoice,
} from '../lib/review-public-identity';

export type TravelerReviewTarget = {
  bookingId: string;
  listingId: string;
  listingTitle: string;
  imageUrl?: string | null;
  mode: 'write' | 'edit';
};

type Step = 1 | 2 | 3 | 'success';

type Props = {
  open: boolean;
  target: TravelerReviewTarget | null;
  userId: string;
  userMetadata?: Record<string, unknown> | null;
  profileDisplayName?: string | null;
  onClose: () => void;
  onSubmitted: (listingId: string) => void;
};

const RATING_LABELS = [
  'Rate 1 out of 5 stars — Poor',
  'Rate 2 out of 5 stars — Fair',
  'Rate 3 out of 5 stars — Good',
  'Rate 4 out of 5 stars — Great',
  'Rate 5 out of 5 stars — Excellent',
] as const;

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
  const [step, setStep] = useState<Step>(1);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loadedComment, setLoadedComment] = useState('');
  const [identity, setIdentity] = useState<ReviewIdentityChoice>('named');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const stepRef = useRef<Step>(1);
  const submittingRef = useRef(false);
  stepRef.current = step;
  submittingRef.current = submitting;

  useDialogFocus(open && Boolean(target), panelRef, () => {
    if (submittingRef.current) return;
    if (stepRef.current === 'success' && target) {
      onSubmitted(target.listingId);
    }
    onClose();
  });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !target) return;
    setError(null);
    setSubmitting(false);
    setStep(1);
    setHoverRating(0);
    let cancelled = false;
    setHydrating(true);
    void (async () => {
      try {
        if (!supabase || target.mode !== 'edit') {
          if (!cancelled) {
            setRating(0);
            setComment('');
            setLoadedComment('');
            setIdentity('named');
          }
          return;
        }
        const { data, error: qErr } = await supabase
          .from('reviews')
          .select('rating, title, comment, guest_name, is_anonymous')
          .eq('user_id', userId)
          .eq('listing_id', target.listingId)
          .maybeSingle();
        if (cancelled) return;
        if (qErr) throw new Error(qErr.message);
        if (data) {
          setRating(Number(data.rating) || 0);
          // Keep legacy title text only as comment seed if comment is empty — never invent.
          const existingComment = (data.comment ?? '').trim();
          const legacyTitle = (data.title ?? '').trim();
          const seeded =
            existingComment ||
            (legacyTitle ? legacyTitle : '');
          setComment(seeded);
          setLoadedComment(seeded);
          setIdentity(
            reviewIdentityFromRow({
              is_anonymous: (data as { is_anonymous?: boolean | null }).is_anonymous,
              guest_name: data.guest_name,
            })
          );
        } else {
          setRating(0);
          setComment('');
          setLoadedComment('');
          setIdentity('named');
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

  if (!open || !target || typeof document === 'undefined') return null;

  const guestDisplayName = travelerDisplayNameFromSources({
    profileDisplayName: profileDisplayName ?? null,
    metadata: userMetadata as {
      full_name?: string;
      name?: string;
      display_name?: string;
      customer_first_name?: string;
      customer_last_name?: string;
    } | null,
  });

  const isEdit = target.mode === 'edit';
  const progressStep = step === 'success' ? 3 : step;
  const shownStars = hoverRating || rating;
  const adjective = ratingAdjective(shownStars);

  const closeJourney = () => {
    if (submitting) return;
    onClose();
  };

  const finishSuccess = () => {
    onSubmitted(target.listingId);
    onClose();
  };

  const submit = async () => {
    if (rating < 1 || rating > 5) {
      setError('Choose a rating from 1 to 5 stars.');
      setStep(1);
      return;
    }
    const normalized = normalizeReviewCommentForSubmit(comment, {
      allowExistingOverLimit: isEdit,
      previousComment: loadedComment,
    });
    if (!normalized.ok) {
      setError(normalized.error);
      setStep(2);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (target.mode === 'write') {
        const already = await userHasReviewedListing(userId, target.listingId);
        if (already) {
          setStep('success');
          return;
        }
      }
      const isAnonymous = identity === 'anonymous';
      const res = await submitReview({
        listingId: target.listingId,
        userId,
        guestName: publicReviewGuestName({
          isAnonymous,
          displayName: guestDisplayName,
        }),
        isAnonymous,
        rating,
        title: null,
        comment: normalized.comment,
        bookingId: target.bookingId,
      });
      if (!res.success) {
        setError(userFacingError(res.error, USER_ERROR.review));
        return;
      }
      setLoadedComment(normalized.comment);
      setStep('success');
    } catch (e) {
      setError(userFacingError(e instanceof Error ? e.message : String(e), USER_ERROR.review));
    } finally {
      setSubmitting(false);
    }
  };

  const headline =
    step === 'success'
      ? isEdit
        ? 'Your review was updated'
        : 'Thank you for your review!'
      : step === 1
        ? 'How was your experience?'
        : step === 2
          ? 'Tell us about your experience'
          : 'How would you like to post your review?';

  return createPortal(
    <div className="tv-review-journey-overlay" role="presentation">
      <button
        type="button"
        tabIndex={-1}
        className="tv-review-journey-overlay__scrim"
        aria-label="Close"
        onClick={closeJourney}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="tv-review-journey"
      >
        <header className="tv-review-journey__chrome">
          <div className="tv-review-journey__listing">
            {target.imageUrl ? (
              <img
                src={target.imageUrl}
                alt=""
                className="tv-review-journey__thumb"
                width={44}
                height={44}
              />
            ) : (
              <div className="tv-review-journey__thumb tv-review-journey__thumb--empty" aria-hidden>
                <Star className="h-4 w-4 text-[#073b83]/55" />
              </div>
            )}
            <p className="tv-review-journey__listing-title" title={target.listingTitle}>
              {target.listingTitle}
            </p>
          </div>
          <button
            type="button"
            className="tv-review-journey__close lux-flat"
            onClick={closeJourney}
            aria-label="Close review"
            disabled={submitting}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        {step !== 'success' ? (
          <div className="tv-review-journey__progress" aria-hidden>
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`tv-review-journey__progress-dot${n <= progressStep ? ' is-active' : ''}`}
              />
            ))}
          </div>
        ) : null}

        <div className="tv-review-journey__body">
          <h2 id={titleId} className="tv-review-journey__headline">
            {headline}
          </h2>

          {hydrating ? (
            <p className="tv-review-journey__muted">Loading your review…</p>
          ) : null}

          {!hydrating && step === 1 ? (
            <div className="tv-review-journey__step">
              <div
                className="tv-review-journey__stars"
                role="radiogroup"
                aria-label="Star rating"
                onMouseLeave={() => setHoverRating(0)}
              >
                {[1, 2, 3, 4, 5].map((i) => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={rating === i}
                    aria-label={RATING_LABELS[i - 1]}
                    className="tv-review-journey__star lux-flat"
                    onMouseEnter={() => setHoverRating(i)}
                    onFocus={() => setHoverRating(i)}
                    onBlur={() => setHoverRating(0)}
                    onClick={() => {
                      setRating(i);
                      setError(null);
                    }}
                  >
                    <Star
                      className={
                        i <= shownStars
                          ? 'tv-review-journey__star-icon is-filled'
                          : 'tv-review-journey__star-icon'
                      }
                      aria-hidden
                    />
                  </button>
                ))}
              </div>
              <p className="tv-review-journey__adjective" aria-live="polite">
                {adjective ?? '\u00a0'}
              </p>
            </div>
          ) : null}

          {!hydrating && step === 2 ? (
            <div className="tv-review-journey__step">
              <label htmlFor={`${titleId}-comment`} className="sr-only">
                Optional comment
              </label>
              <textarea
                id={`${titleId}-comment`}
                rows={5}
                maxLength={Math.max(REVIEW_COMMENT_MAX_CHARS, loadedComment.length)}
                value={comment}
                onChange={(e) => {
                  const next = e.target.value;
                  const softCap = Math.max(REVIEW_COMMENT_MAX_CHARS, loadedComment.length);
                  setComment(next.length > softCap ? next.slice(0, softCap) : next);
                  setError(null);
                }}
                className="tv-review-journey__textarea tv-input"
                placeholder="What stood out? (optional)"
                aria-describedby={`${titleId}-counter`}
              />
              <p id={`${titleId}-counter`} className="tv-review-journey__counter">
                {comment.trim().length}/{REVIEW_COMMENT_MAX_CHARS}
                {loadedComment.length > REVIEW_COMMENT_MAX_CHARS &&
                comment.trim() === loadedComment.trim()
                  ? ' · shorten to save changes to this text'
                  : ''}
              </p>
            </div>
          ) : null}

          {!hydrating && step === 3 ? (
            <div className="tv-review-journey__step tv-review-journey__identity">
              <button
                type="button"
                className={`tv-review-journey__choice lux-flat${identity === 'named' ? ' is-selected' : ''}`}
                aria-pressed={identity === 'named'}
                onClick={() => setIdentity('named')}
              >
                <span className="tv-review-journey__choice-title">Post with my name</span>
                <span className="tv-review-journey__choice-body">
                  Review will be posted as {guestDisplayName}.
                </span>
              </button>
              <button
                type="button"
                className={`tv-review-journey__choice lux-flat${
                  identity === 'anonymous' ? ' is-selected' : ''
                }`}
                aria-pressed={identity === 'anonymous'}
                onClick={() => setIdentity('anonymous')}
              >
                <span className="tv-review-journey__choice-title">Post anonymously</span>
                <span className="tv-review-journey__choice-body">
                  Your name won&apos;t be shown publicly.
                </span>
              </button>
            </div>
          ) : null}

          {!hydrating && step === 'success' ? (
            <div className="tv-review-journey__success">
              <div className="tv-review-journey__success-icon" aria-hidden>
                <Check className="h-7 w-7" strokeWidth={2.25} />
              </div>
              <p className="tv-review-journey__muted">
                {isEdit
                  ? 'Your changes are saved and visible where reviews are shown.'
                  : 'Your review has been submitted successfully.'}
              </p>
            </div>
          ) : null}

          {error ? (
            <NoticeCallout title="Could not save review" tone="danger">
              {error}
            </NoticeCallout>
          ) : null}
        </div>

        <footer className="tv-review-journey__footer">
          {step === 'success' ? (
            <button
              type="button"
              className="tv-btn-primary tv-review-journey__primary"
              onClick={finishSuccess}
            >
              Continue to Trips
            </button>
          ) : (
            <>
              {step > 1 ? (
                <button
                  type="button"
                  className="tv-btn-ghost tv-review-journey__back"
                  disabled={submitting || hydrating}
                  onClick={() => {
                    setError(null);
                    setStep((s) => (s === 3 ? 2 : 1));
                  }}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  Back
                </button>
              ) : (
                <span />
              )}
              {step === 1 ? (
                <button
                  type="button"
                  className="tv-btn-primary tv-review-journey__primary"
                  disabled={hydrating || rating < 1}
                  onClick={() => {
                    setError(null);
                    setStep(2);
                  }}
                >
                  Continue
                </button>
              ) : null}
              {step === 2 ? (
                <button
                  type="button"
                  className="tv-btn-primary tv-review-journey__primary"
                  disabled={hydrating}
                  onClick={() => {
                    const normalized = normalizeReviewCommentForSubmit(comment, {
                      allowExistingOverLimit: isEdit,
                      previousComment: loadedComment,
                    });
                    if (!normalized.ok) {
                      setError(normalized.error);
                      return;
                    }
                    setError(null);
                    setStep(3);
                  }}
                >
                  Continue
                </button>
              ) : null}
              {step === 3 ? (
                <button
                  type="button"
                  className="tv-btn-primary tv-review-journey__primary"
                  disabled={submitting || hydrating}
                  aria-busy={submitting || undefined}
                  onClick={() => void submit()}
                >
                  {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Post review'}
                </button>
              ) : null}
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body
  );
}
