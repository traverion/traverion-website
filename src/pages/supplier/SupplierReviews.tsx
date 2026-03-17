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

  const handleSubmitReply = async (reviewId: string) => {
    if (!user) return;
    const text = (replyText[reviewId] ?? '').trim();
    if (!text) return;
    setReplyingId(reviewId);
    const res = await submitReviewReply(reviewId, user.id, text);
    setReplyingId(null);
    if (res.success) load();
  };

  if (!isSupabase || !user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Reviews</h1>
        <p className="text-gray-600 mt-1">See and respond to customer reviews for your listings.</p>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm flex items-center justify-between gap-4">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</span>
          <button type="button" onClick={() => load()} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-100 text-red-800 font-medium hover:bg-red-200">
            <RefreshCw className="w-4 h-4" /> Try again
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
              className="bg-white border border-gray-200 rounded-xl p-6"
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
