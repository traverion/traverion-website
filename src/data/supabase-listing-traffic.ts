import { supabase } from '../lib/supabase';

export type ListingTrafficEventType = 'impression' | 'view' | 'book_start' | 'book_complete';

export type ListingTrafficCounts = {
  listingId: string;
  impressions: number;
  views: number;
  bookStarts: number;
  bookCompletes: number;
};

export async function recordListingTrafficEvent(input: {
  listingId: string;
  eventType: ListingTrafficEventType;
  sessionKey: string;
}): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('listing_traffic_events').insert({
    listing_id: input.listingId,
    event_type: input.eventType,
    session_key: input.sessionKey.slice(0, 64),
  });
  if (error) {
    // Table missing or unique conflict — silent for travelers.
    if (/listing_traffic_events|42P01|duplicate|23505/i.test(error.message)) return false;
    return false;
  }
  return true;
}

/** Aggregate traffic for supplier-owned listings in a date window. */
export async function fetchListingTrafficCounts(input: {
  listingIds: string[];
  from: string | null;
  to: string | null;
}): Promise<{ counts: ListingTrafficCounts[]; available: boolean }> {
  if (!supabase || input.listingIds.length === 0) {
    return { counts: [], available: false };
  }
  let query = supabase
    .from('listing_traffic_events')
    .select('listing_id, event_type')
    .in('listing_id', input.listingIds);
  if (input.from) query = query.gte('created_at', `${input.from}T00:00:00.000Z`);
  if (input.to) query = query.lte('created_at', `${input.to}T23:59:59.999Z`);
  const { data, error } = await query;
  if (error) {
    if (/listing_traffic_events|42P01|does not exist/i.test(error.message)) {
      return { counts: [], available: false };
    }
    throw new Error(error.message);
  }
  const map = new Map<string, ListingTrafficCounts>();
  for (const id of input.listingIds) {
    map.set(id, { listingId: id, impressions: 0, views: 0, bookStarts: 0, bookCompletes: 0 });
  }
  for (const row of data ?? []) {
    const id = String((row as { listing_id: string }).listing_id);
    const type = String((row as { event_type: string }).event_type);
    const cur = map.get(id) ?? {
      listingId: id,
      impressions: 0,
      views: 0,
      bookStarts: 0,
      bookCompletes: 0,
    };
    if (type === 'impression') cur.impressions += 1;
    else if (type === 'view') cur.views += 1;
    else if (type === 'book_start') cur.bookStarts += 1;
    else if (type === 'book_complete') cur.bookCompletes += 1;
    map.set(id, cur);
  }
  return { counts: [...map.values()], available: true };
}
