/**
 * Supplier-facing rental availability: blocks, holds, stock reads, evaluate RPC.
 * Claim/release/confirm stay service-role only (not called from the browser).
 */

import { supabase } from '../lib/supabase';
import { normalizeRentalDetails } from '../lib/rental-details';
import type { RentalDetails, RentalVariant } from '../types/rental';
import {
  evaluateRentalAvailability,
  type RentalInterval,
  type RentalStockOccupancy,
} from '../lib/rental-availability';

export type RentalAvailabilityBlockRow = {
  id: string;
  listing_id: string;
  variant_id: string | null;
  starts_at: string;
  ends_at: string;
  note: string | null;
  created_at: string;
};

export type RentalInventoryHoldRow = {
  id: string;
  listing_id: string;
  variant_id: string;
  quantity: number;
  starts_at: string;
  ends_at: string;
  status: 'held' | 'confirmed' | 'released' | 'expired';
  hold_expires_at: string | null;
  booking_id: string | null;
  created_at: string;
};

export type RentalEvaluateRpcResult = {
  ok: boolean;
  error?: string;
  available?: number;
  stock?: number;
  reserved?: number;
  occupied_start?: string;
  occupied_end?: string;
  buffer_minutes?: number;
};

function toInterval(startsAt: string, endsAt: string): RentalInterval | null {
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return { startMs, endMs };
}

export function rentalVariantsFromListingExtras(extras: unknown): RentalVariant[] {
  if (!extras || typeof extras !== 'object') return [];
  const rental = normalizeRentalDetails((extras as { rental?: unknown }).rental);
  return rental?.variants ?? [];
}

export function rentalDetailsFromListingExtras(extras: unknown): RentalDetails | undefined {
  if (!extras || typeof extras !== 'object') return undefined;
  return normalizeRentalDetails((extras as { rental?: unknown }).rental);
}

export async function fetchRentalAvailabilityBlocks(
  listingId: string,
  rangeStartIso: string,
  rangeEndIso: string
): Promise<RentalAvailabilityBlockRow[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('rental_availability_blocks')
    .select('id, listing_id, variant_id, starts_at, ends_at, note, created_at')
    .eq('listing_id', listingId)
    .lt('starts_at', rangeEndIso)
    .gt('ends_at', rangeStartIso)
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as RentalAvailabilityBlockRow[];
}

export async function fetchRentalInventoryHolds(
  listingId: string,
  rangeStartIso: string,
  rangeEndIso: string
): Promise<RentalInventoryHoldRow[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('rental_inventory_holds')
    .select(
      'id, listing_id, variant_id, quantity, starts_at, ends_at, status, hold_expires_at, booking_id, created_at'
    )
    .eq('listing_id', listingId)
    .in('status', ['held', 'confirmed'])
    .lt('starts_at', rangeEndIso)
    .gt('ends_at', rangeStartIso)
    .order('starts_at', { ascending: true });
  if (error) throw error;
  const now = Date.now();
  return ((data ?? []) as RentalInventoryHoldRow[]).filter((h) => {
    if (h.status === 'confirmed') return true;
    if (!h.hold_expires_at) return true;
    return Date.parse(h.hold_expires_at) > now;
  });
}

export async function createRentalAvailabilityBlock(input: {
  listingId: string;
  variantId?: string | null;
  startsAtIso: string;
  endsAtIso: string;
  note?: string | null;
  createdBy?: string | null;
}): Promise<RentalAvailabilityBlockRow> {
  if (!supabase) throw new Error('Supabase not configured');
  const start = Date.parse(input.startsAtIso);
  const end = Date.parse(input.endsAtIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error('Block end must be after start.');
  }
  const { data, error } = await supabase
    .from('rental_availability_blocks')
    .insert({
      listing_id: input.listingId,
      variant_id: input.variantId?.trim() || null,
      starts_at: input.startsAtIso,
      ends_at: input.endsAtIso,
      note: input.note?.trim() ? input.note.trim().slice(0, 240) : null,
      created_by: input.createdBy ?? null,
    })
    .select('id, listing_id, variant_id, starts_at, ends_at, note, created_at')
    .single();
  if (error) throw error;
  return data as RentalAvailabilityBlockRow;
}

export async function deleteRentalAvailabilityBlock(blockId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('rental_availability_blocks').delete().eq('id', blockId);
  if (error) throw error;
}

/** Server-authoritative evaluate via SECURITY DEFINER RPC. */
export async function evaluateRentalAvailabilityRpc(input: {
  listingId: string;
  variantId: string;
  quantity: number;
  startsAtIso: string;
  endsAtIso: string;
  excludeHoldId?: string | null;
}): Promise<RentalEvaluateRpcResult> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.rpc('evaluate_rental_availability', {
    p_listing_id: input.listingId,
    p_variant_id: input.variantId,
    p_quantity: input.quantity,
    p_starts_at: input.startsAtIso,
    p_ends_at: input.endsAtIso,
    p_exclude_hold_id: input.excludeHoldId ?? null,
  });
  if (error) throw error;
  return (data ?? { ok: false, error: 'empty_response' }) as RentalEvaluateRpcResult;
}

export async function fetchRentalVariantReservedQuantity(
  listingId: string,
  variantId: string,
  startsAtIso?: string | null,
  endsAtIso?: string | null
): Promise<number> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.rpc('rental_variant_reserved_quantity', {
    p_listing_id: listingId,
    p_variant_id: variantId,
    p_starts_at: startsAtIso ?? null,
    p_ends_at: endsAtIso ?? null,
  });
  if (error) throw error;
  const n = typeof data === 'number' ? data : Number(data);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * Client-side preview using fetched rows + pure evaluator.
 * Prefer evaluateRentalAvailabilityRpc when confirming a specific interval.
 */
export function previewDayAvailability(args: {
  variantId: string;
  stock: number;
  dayStartMs: number;
  dayEndMs: number;
  bufferMinutes: number;
  bookingNoticeHours: number;
  nowMs: number;
  blocks: RentalAvailabilityBlockRow[];
  holds: RentalInventoryHoldRow[];
}): { available: number; reserved: number; blocked: boolean } {
  const window: RentalInterval = { startMs: args.dayStartMs, endMs: args.dayEndMs };
  const blockIntervals = args.blocks
    .filter((b) => !b.variant_id || b.variant_id === args.variantId)
    .map((b) => toInterval(b.starts_at, b.ends_at))
    .filter((x): x is RentalInterval => Boolean(x));

  const occupancies: RentalStockOccupancy[] = args.holds
    .filter((h) => h.variant_id === args.variantId)
    .map((h) => {
      const interval = toInterval(h.starts_at, h.ends_at);
      if (!interval) return null;
      return { variantId: h.variant_id, interval, quantity: h.quantity };
    })
    .filter((x): x is RentalStockOccupancy => Boolean(x));

  const result = evaluateRentalAvailability({
    variantId: args.variantId,
    stock: args.stock,
    requestedQty: 1,
    pickupReturn: window,
    bufferMinutes: args.bufferMinutes,
    bookingNoticeHours: 0,
    nowMs: args.nowMs,
    blocks: blockIntervals,
    occupancies,
  });

  const reserved = Math.max(0, args.stock - (result.available ?? 0));
  return {
    available: result.available ?? 0,
    reserved,
    blocked: !result.ok && result.error?.includes('blocked') === true,
  };
}
