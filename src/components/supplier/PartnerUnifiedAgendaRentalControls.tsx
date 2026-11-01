/**
 * Agenda rental availability controls — block/unblock + inline stock for one option/day.
 * Optimistic local patches; never reloads the full calendar.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import type { TourPackage } from '../../types/tour';
import {
  fetchRentalInventoryHolds,
  type RentalAvailabilityBlockRow,
  type RentalInventoryHoldRow,
} from '../../data/supabase-rental-availability';
import {
  partnerUnifiedAdjustRentalStock,
  partnerUnifiedBlockRentalDay,
  partnerUnifiedDayBoundsUtc,
  partnerUnifiedRentalDayVariants,
  partnerUnifiedUnblockRentalDay,
} from '../../lib/partner-unified-day-edits';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import type { PartnerUnifiedCalendarEvent } from '../../lib/partner-unified-calendar';

export type PartnerUnifiedAgendaRentalPatch =
  | { type: 'listing'; listing: TourPackage }
  | { type: 'rentalBlockAdd'; block: RentalAvailabilityBlockRow }
  | { type: 'rentalBlockRemove'; blockIds: string[] };

type Props = {
  event: PartnerUnifiedCalendarEvent;
  listing: TourPackage;
  blocks: RentalAvailabilityBlockRow[];
  canEdit: boolean;
  userId?: string | null;
  onPatch: (patch: PartnerUnifiedAgendaRentalPatch) => void;
};

const listingSaveChains = new Map<string, Promise<unknown>>();

function enqueueListingSave<T>(listingId: string, task: () => Promise<T>): Promise<T> {
  const prior = listingSaveChains.get(listingId) ?? Promise.resolve();
  const next = prior.catch(() => undefined).then(task);
  listingSaveChains.set(
    listingId,
    next.then(
      () => undefined,
      () => undefined
    )
  );
  return next;
}

function PartnerUnifiedAgendaRentalControls({
  event,
  listing,
  blocks,
  canEdit,
  userId,
  onPatch,
}: Props) {
  const [holds, setHolds] = useState<RentalInventoryHoldRow[]>([]);
  const [loadingHolds, setLoadingHolds] = useState(true);
  const [saving, setSaving] = useState<'block' | 'stock' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingStock, setEditingStock] = useState(false);
  const [stockDraft, setStockDraft] = useState('');
  const [localBlocked, setLocalBlocked] = useState<boolean | null>(null);
  const [localStock, setLocalStock] = useState<number | null>(null);
  const [localAvailable, setLocalAvailable] = useState<number | null>(null);
  const inFlightRef = useRef(false);
  const listingRef = useRef(listing);
  listingRef.current = listing;

  const listingBlocks = useMemo(
    () => blocks.filter((b) => b.listing_id === listing.id),
    [blocks, listing.id]
  );

  const loadHolds = useCallback(async () => {
    setLoadingHolds(true);
    try {
      const bounds = partnerUnifiedDayBoundsUtc(event.ymd);
      const rows = await fetchRentalInventoryHolds(listing.id, bounds.startIso, bounds.endIso);
      setHolds(rows);
    } catch {
      setHolds([]);
    } finally {
      setLoadingHolds(false);
    }
  }, [event.ymd, listing.id]);

  useEffect(() => {
    void loadHolds();
  }, [loadHolds]);

  const variants = useMemo(
    () =>
      partnerUnifiedRentalDayVariants({
        listing,
        iso: event.ymd,
        blocks: listingBlocks,
        holds,
      }),
    [listing, event.ymd, listingBlocks, holds]
  );

  const focused = useMemo(() => {
    if (variants.length === 0) return null;
    const option = (event.optionLabel ?? '').trim();
    if (option && option !== 'Inventory availability' && option !== 'All options' && option !== 'Option block') {
      const match = variants.find((v) => v.name === option);
      if (match) return match;
    }
    return variants[0] ?? null;
  }, [variants, event.optionLabel]);

  const blocked = localBlocked ?? focused?.blocked ?? event.kind === 'rental_block';
  const stock = localStock ?? focused?.stock ?? 0;
  const available = localAvailable ?? focused?.available ?? 0;
  const reserved = focused?.reserved ?? 0;

  useEffect(() => {
    if (localBlocked != null && focused && localBlocked === focused.blocked) setLocalBlocked(null);
  }, [focused?.blocked, localBlocked, focused]);

  useEffect(() => {
    if (localStock != null && focused && localStock === focused.stock) setLocalStock(null);
  }, [focused?.stock, localStock, focused]);

  useEffect(() => {
    if (localAvailable != null && focused && localAvailable === focused.available) {
      setLocalAvailable(null);
    }
  }, [focused?.available, localAvailable, focused]);

  useEffect(() => {
    if (editingStock && focused) setStockDraft(String(focused.stock));
  }, [editingStock, focused]);

  const toggleBlock = async () => {
    if (!canEdit || !focused || inFlightRef.current) return;
    if (blocked && focused.multiDayBlock && focused.exactBlockIds.length === 0) {
      setError('Covered by a multi-day block — unblock from rental calendar.');
      return;
    }
    const nextBlocked = !blocked;
    const previous = blocked;
    const exactIds = focused.exactBlockIds;
    inFlightRef.current = true;
    setSaving('block');
    setError(null);
    setLocalBlocked(nextBlocked);
    try {
      if (nextBlocked) {
        const res = await partnerUnifiedBlockRentalDay({
          listingId: listing.id,
          iso: event.ymd,
          variantId: focused.variantId,
          createdBy: userId,
        });
        if (!res.ok) {
          setLocalBlocked(previous);
          setError(res.error ?? 'Could not save.');
          return;
        }
        if (res.block) onPatch({ type: 'rentalBlockAdd', block: res.block });
      } else {
        const res = await partnerUnifiedUnblockRentalDay({
          exactBlockIds: exactIds,
          multiDayBlock: focused.multiDayBlock,
        });
        if (!res.ok) {
          setLocalBlocked(previous);
          setError(res.error ?? 'Could not save.');
          return;
        }
        onPatch({ type: 'rentalBlockRemove', blockIds: exactIds });
      }
    } catch (e) {
      setLocalBlocked(previous);
      setError(userFacingError(e, USER_ERROR.listingSave));
    } finally {
      inFlightRef.current = false;
      setSaving(null);
    }
  };

  const saveStock = async () => {
    if (!canEdit || !focused || inFlightRef.current) return;
    const next = Math.floor(Number(stockDraft) || 0);
    if (next < reserved) {
      setError(
        `Cannot set stock below ${reserved} reserved unit${reserved === 1 ? '' : 's'}.`
      );
      return;
    }
    const previousStock = stock;
    const previousAvailable = available;
    inFlightRef.current = true;
    setSaving('stock');
    setError(null);
    setLocalStock(next);
    setLocalAvailable(Math.max(0, next - reserved));
    try {
      await enqueueListingSave(listing.id, async () => {
        const res = await partnerUnifiedAdjustRentalStock({
          listing: listingRef.current,
          variantId: focused.variantId,
          nextStock: next,
          holds,
        });
        if (!res.ok) {
          setLocalStock(previousStock);
          setLocalAvailable(previousAvailable);
          setError(res.error ?? 'Could not save.');
          return;
        }
        if (res.listing) onPatch({ type: 'listing', listing: res.listing });
        setEditingStock(false);
      });
    } catch (e) {
      setLocalStock(previousStock);
      setLocalAvailable(previousAvailable);
      setError(userFacingError(e, USER_ERROR.listingSave));
    } finally {
      inFlightRef.current = false;
      setSaving(null);
    }
  };

  const busy = saving != null;
  const blockDisabled =
    !canEdit ||
    busy ||
    loadingHolds ||
    !focused ||
    (blocked && focused.multiDayBlock && focused.exactBlockIds.length === 0);

  return (
    <div className="puc-tour-ops" onClick={(e) => e.stopPropagation()}>
      <div className="puc-tour-ops__seg puc-tour-ops__seg--block">
        <label className={`puc-tour-ops__switch${blocked ? ' is-on' : ''}`}>
          <span className="puc-tour-ops__seg-label">Block</span>
          <input
            type="checkbox"
            role="switch"
            aria-label={blocked ? 'Unblock rental day' : 'Block rental day'}
            checked={blocked}
            disabled={blockDisabled}
            onChange={() => void toggleBlock()}
          />
          <span className="puc-tour-ops__switch-ui" aria-hidden>
            {saving === 'block' ? <Loader2 className="puc-tour-ops__spin" aria-hidden /> : null}
          </span>
        </label>
        {blocked ? <span className="puc-tour-ops__blocked">Blocked</span> : null}
      </div>

      <div className="puc-tour-ops__seg puc-tour-ops__seg--capacity">
        <span className="puc-tour-ops__seg-label">Stock</span>
        {editingStock && focused ? (
          <div className="puc-tour-ops__edit">
            <input
              type="number"
              className="tv-input puc-tour-ops__input"
              min={Math.max(1, reserved)}
              max={999}
              disabled={busy || !canEdit}
              value={stockDraft}
              aria-label="Option stock"
              onChange={(e) => setStockDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingStock(false);
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void saveStock();
                }
              }}
            />
            <button
              type="button"
              className="puc-tour-ops__icon-btn"
              disabled={busy || !canEdit}
              aria-label="Save stock"
              onClick={() => void saveStock()}
            >
              {saving === 'stock' ? (
                <Loader2 className="puc-tour-ops__spin" aria-hidden />
              ) : (
                <Check className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
            <button
              type="button"
              className="puc-tour-ops__icon-btn"
              disabled={busy}
              aria-label="Cancel stock edit"
              onClick={() => setEditingStock(false)}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="puc-tour-ops__value-row">
            <span
              className="puc-tour-ops__value"
              title={
                loadingHolds
                  ? 'Loading availability…'
                  : `${available} available of ${stock}${reserved ? ` · ${reserved} reserved` : ''}`
              }
            >
              {loadingHolds ? '…' : `${available} / ${stock}`}
            </span>
            {canEdit && focused ? (
              <button
                type="button"
                className="puc-tour-ops__icon-btn"
                disabled={busy || blocked}
                aria-label="Edit stock"
                onClick={() => setEditingStock(true)}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        )}
      </div>

      {error ? (
        <p className="puc-tour-ops__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default memo(PartnerUnifiedAgendaRentalControls);
