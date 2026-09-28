import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchWishlistListingIds, toggleWishlist } from '../data/supabase-wishlist';
import { isSupabaseListingId } from '../lib/discount-display';
import { isSupabaseConfigured } from '../lib/supabase';
import { recordTravelerInterest } from '../lib/traveler-interest';

/**
 * Persisted traveler wishlist for browse cards. Hearts are omitted when Supabase
 * is not configured so the control is never a decorative no-op.
 *
 * Phase 1301: load failure must not invent an empty Saved set (would show every
 * heart as unsaved). Keep prior IDs; expose ready so callers can hide hearts
 * until a successful fetch (or until prior IDs exist after a later failure).
 */
export function useTravelerWishlist() {
  const { user, requestAuth } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const enabled = isSupabaseConfigured();
  const wishlistUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !user?.id) {
      wishlistUserIdRef.current = null;
      setIds(new Set());
      setReady(false);
      setLoadError(false);
      return;
    }
    // Phase 1400: new traveler — do not show the prior account’s hearts while loading (Wishlist page 1377 parity).
    if (wishlistUserIdRef.current !== user.id) {
      wishlistUserIdRef.current = user.id;
      setIds(new Set());
    }
    let cancelled = false;
    setReady(false);
    setLoadError(false);
    void fetchWishlistListingIds(user.id)
      .then((list) => {
        if (cancelled) return;
        setIds(new Set(list));
        setReady(true);
        setLoadError(false);
      })
      .catch(() => {
        // Phase 1301: keep prior IDs — infrastructure failure ≠ “nothing saved”.
        if (!cancelled) {
          setLoadError(true);
          setReady(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, user?.id]);

  const toggle = useCallback(
    (listingId: string) => {
      if (!enabled || !isSupabaseListingId(listingId)) return;
      const run = async () => {
        const uid = userRef.current?.id;
        if (!uid) return;
        const previous = idsRef.current.has(listingId);
        setIds((current) => {
          const next = new Set(current);
          if (previous) next.delete(listingId);
          else next.add(listingId);
          return next;
        });
        setBusyId(listingId);
        try {
          const res = await toggleWishlist(uid, listingId);
          if (res.error) {
            setIds((current) => {
              const next = new Set(current);
              if (previous) next.add(listingId);
              else next.delete(listingId);
              return next;
            });
          } else {
            setIds((current) => {
              const next = new Set(current);
              if (res.inWishlist) next.add(listingId);
              else next.delete(listingId);
              return next;
            });
            if (res.inWishlist) {
              recordTravelerInterest({ kind: 'wishlist_save', key: listingId });
            }
          }
        } catch {
          setIds((current) => {
            const next = new Set(current);
            if (previous) next.add(listingId);
            else next.delete(listingId);
            return next;
          });
        } finally {
          setBusyId(null);
        }
      };
      if (!userRef.current) {
        requestAuth({ onSuccess: () => void run() });
        return;
      }
      void run();
    },
    [enabled, requestAuth]
  );

  /** Hearts are trustworthy after a successful load, or when prior IDs survived a failed reload. */
  const heartsKnown = ready || ids.size > 0;

  return {
    enabled,
    ready,
    loadError,
    heartsKnown,
    savedIds: ids,
    busyId,
    toggle,
    isSaved: (listingId: string) => ids.has(listingId),
  };
}
