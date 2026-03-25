/**
 * Supplier: view all reviews for my listings and reply.
 */
import { useState, useEffect, useCallback } from 'react';
import { Star, MessageSquare, Send, AlertCircle, RefreshCw } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import {
  fetchReviewsForSupplierListings,
  getReviewRepliesByReviewIds,
  submitReviewReply,
  type ReviewDisplay,
  type ReviewReplyRow,
} from '../../data/supabase-reviews';
export default function SupplierReviews() {
  const { user, isSupabase } = useSupplierAuth();
  const [reviews, setReviews] = useState<(ReviewDisplay & { listing_title?: string })[]>([]);
  const [replies, setReplies] = useState<Record<string, ReviewReplyRow>>({});
  const [loading, setLoading] = useState(true);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [highlightReviewId, setHighlightReviewId] = useState<string | null>(null);
  const [draftToneByReview, setDraftToneByReview] = useState<Record<string, 'friendly' | 'professional' | 'short'>>({});

  const load = useCallback(async () => {
    if (!isSupabase || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await fetchReviewsForSupplierListings(user.id);
      setReviews(list);
      const ids = list.map((r) => r.id);
      const replyMap = await getReviewRepliesByReviewIds(ids);
      setReplies(replyMap);
      setReplyText(
        list.reduce<Record<string, string>>((acc, r) => {
          acc[r.id] = replyMap[r.id]?.reply_text ?? '';
          return acc;
        }, {})
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, [isSupabase, user]);

  useEffect(() => {
    load();
  }, [load]);

  const readHighlightFromUrl = useCallback(() => {
    const id = new URLSearchParams(window.location.search).get('highlight');
    setHighlightReviewId(id && id.length > 0 ? id : null);
  }, []);

  useEffect(() => {
    readHighlightFromUrl();
    const onPop = () => readHighlightFromUrl();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [readHighlightFromUrl]);

  useEffect(() => {
    if (!highlightReviewId || loading) return;
    const el = document.getElementById(`supplier-review-card-${highlightReviewId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightReviewId, loading, reviews.length]);

  const handleSubmitReply = async (reviewId: string) => {
    if (!user) return;
    const text = (replyText[reviewId] ?? '').trim();
    if (!text) return;
    setReplyingId(reviewId);
    setReplyError(null);
    const res = await submitReviewReply(reviewId, user.id, text);
    setReplyingId(null);
    if (res.success) {
      load();
    } else {
      setReplyError(res.error ?? 'Could not save reply. Check that you own this listing.');
    }
  };

  const generateReplyDraft = (
    r: ReviewDisplay & { listing_title?: string },
    tone: 'friendly' | 'professional' | 'short'
  ) => {
    const guest = r.guest_name?.trim() || 'there';
    const listing = r.listing_title || 'your experience';
    if (tone === 'short') {
      return `Hi ${guest}, thank you for your review of ${listing}. We appreciate your feedback and hope to welcome you again soon.`;
    }
    if (tone === 'professional') {
      return `Hello ${guest}, thank you for taking the time to share your feedback about ${listing}. We appreciate your comments and continuously use guest input to improve the experience. We hope to host you again in the future.`;
    }
    return `Hi ${guest}! Thank you so much for the lovely review on ${listing}. We're really happy you joined us, and your feedback means a lot to our team. Hope to see you again soon!`;
  };

  const averageResponseHours = (() => {
    const deltas: number[] = [];
    for (const r of reviews) {
      const reply = replies[r.id];
      if (!reply) continue;
      const reviewAt = new Date(r.created_at).getTime();
      const replyAt = new Date(reply.created_at).getTime();
      if (Number.isFinite(reviewAt) && Number.isFinite(replyAt) && replyAt >= reviewAt) {
        deltas.push((replyAt - reviewAt) / (1000 * 60 * 60));
      }
    }
    if (deltas.length === 0) return null;
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    return Math.round(avg * 10) / 10;
  })();

  const unrepliedCount = reviews.filter((r) => !replies[r.id]).length;

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Reviews</h1>
        <p className="text-gray-600 mt-1">See and respond to customer reviews for your listings.</p>
      </div>

      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">Total reviews</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{reviews.length}</p>
          </div>
          <div className="bg-white border border-amber-200 bg-amber-50/40 rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-amber-800 font-medium">Need reply</p>
            <p className="text-2xl font-semibold text-amber-900 mt-1">{unrepliedCount}</p>
          </div>
          <div className="bg-white border border-blue-200 bg-blue-50/40 rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-blue-800 font-medium">Avg response time</p>
            <p className="text-2xl font-semibold text-blue-900 mt-1">
              {averageResponseHours == null ? '—' : `${averageResponseHours}h`}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm flex items-center justify-between gap-4">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</span>
          <button type="button" onClick={() => load()} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-100 text-red-800 font-medium hover:bg-red-200">
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      )}

      {replyError && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm flex items-center justify-between gap-4">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{replyError}</span>
          <button type="button" onClick={() => setReplyError(null)} className="text-sm font-medium text-red-800 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-500">Loading reviews…</p>
        </div>
      ) : reviews.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <Star className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900">No reviews yet</h2>
          <p className="text-gray-500 mt-1">Reviews from customers will appear here once they leave feedback.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {reviews.map((r) => (
            <div
              key={r.id}
              id={`supplier-review-card-${r.id}`}
              className={`bg-white border rounded-xl p-6 transition-shadow ${
                highlightReviewId === r.id
                  ? 'border-finland ring-2 ring-finland/25 shadow-md'
                  : !replies[r.id]
                    ? 'border-amber-200 bg-amber-50/20'
                    : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-500 mb-1">
                    {r.listing_title ?? 'Listing'} · {new Date(r.created_at).toLocaleDateString()}
                  </p>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-gray-900">{r.guest_name}</span>
                    {r.verified && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Verified</span>
                    )}
                  </div>
                  <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        size={16}
                        className={i <= r.rating ? 'text-amber-500 fill-amber-500' : 'text-gray-300'}
                      />
                    ))}
                  </div>
                  {r.title && <p className="font-medium text-gray-900 mb-1">{r.title}</p>}
                  <p className="text-gray-700">{r.comment}</p>
                </div>
              </div>

              {replies[r.id] ? (
                <div className="mt-4 pl-4 border-l-2 border-finland/30">
                  <p className="text-sm font-medium text-gray-700 mb-1">Your reply</p>
                  <p className="text-gray-600">{replies[r.id].reply_text}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(replies[r.id].created_at).toLocaleDateString()}
                  </p>
                </div>
              ) : (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <MessageSquare className="w-4 h-4 inline mr-1" />
                    Reply (optional)
                  </label>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {([
                      { id: 'friendly', label: 'Friendly' },
                      { id: 'professional', label: 'Professional' },
                      { id: 'short', label: 'Short' },
                    ] as const).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setDraftToneByReview((prev) => ({ ...prev, [r.id]: t.id }));
                          const draft = generateReplyDraft(r, t.id);
                          setReplyText((prev) => ({ ...prev, [r.id]: draft }));
                        }}
                        className={`px-2.5 py-1 rounded-full text-xs border ${
                          (draftToneByReview[r.id] ?? 'friendly') === t.id
                            ? 'bg-finland/10 text-finland border-finland/30'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {t.label} draft
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const tone = draftToneByReview[r.id] ?? 'friendly';
                        const draft = generateReplyDraft(r, tone);
                        setReplyText((prev) => ({ ...prev, [r.id]: draft }));
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                      Regenerate
                    </button>
                  </div>
                  <textarea
                    value={replyText[r.id] ?? ''}
                    onChange={(e) => setReplyText((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    placeholder="Thank the customer or answer a question..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland text-sm"
                  />
                  <button
                    type="button"
                    disabled={replyingId === r.id || !(replyText[r.id] ?? '').trim()}
                    onClick={() => handleSubmitReply(r.id)}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-finland text-white text-sm font-medium hover:bg-finland-dark disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {replyingId === r.id ? 'Sending…' : 'Send reply'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
