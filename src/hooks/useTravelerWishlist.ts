import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchWishlistListingIds, toggleWishlist } from '../data/supabase-wishlist';
import { isSupabaseListingId } from '../lib/discount-display';
import { isSupabaseConfigured } from '../lib/supabase';
import { recordTravelerInterest } from '../lib/traveler-interest';

/**
 * Persisted traveler wishlist for browse cards. Hearts are omitted when Supabase
 * is not configured so the control is never a decorative no-op.
 */
export function useTravelerWishlist() {
  const { user, requestAuth } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const [busyId, setBusyId] = useState<string | null>(null);
  const enabled = isSupabaseConfigured();

  useEffect(() => {
    if (!enabled || !user?.id) {
      setIds(new Set());
      return;
    }
    let cancelled = false;
    void fetchWishlistListingIds(user.id)
      .then((list) => {
        if (!cancelled) setIds(new Set(list));
      })
      .catch(() => {
        if (!cancelled) setIds(new Set());
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

  return {
    enabled,
    savedIds: ids,
    busyId,
    toggle,
    isSaved: (listingId: string) => ids.has(listingId),
  };
}
