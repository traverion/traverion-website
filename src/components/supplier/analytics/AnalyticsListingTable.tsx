import { useMemo, useState } from 'react';
import type { AnalyticsListingRow } from '../../../lib/partner-analytics';
import { formatMoney } from '../../../lib/money';

type SortKey = 'title' | 'bookings' | 'guests' | 'gross' | 'commission' | 'net' | 'share';

type Props = {
  rows: AnalyticsListingRow[];
  mode: 'summary' | 'sales' | 'bookings';
  onOpenListing: (listingId: string) => void;
  searchEnabled?: boolean;
};

export default function AnalyticsListingTable({
  rows,
  mode,
  onOpenListing,
  searchEnabled = true,
}: Props) {
  const [sort, setSort] = useState<SortKey>(mode === 'bookings' ? 'bookings' : 'net');
  const [asc, setAsc] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 12;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (q) list = list.filter((row) => row.title.toLowerCase().includes(q));
    const sorted = [...list].sort((a, b) => {
      const dir = asc ? 1 : -1;
      if (sort === 'title') return a.title.localeCompare(b.title) * dir;
      if (sort === 'bookings') return (a.bookings - b.bookings) * dir;
      if (sort === 'guests') return (a.guests - b.guests) * dir;
      if (sort === 'gross') return (a.gross - b.gross) * dir;
      if (sort === 'commission') return (a.commission - b.commission) * dir;
      if (sort === 'share') return (a.shareOfNet - b.shareOfNet) * dir;
      return (a.net - b.net) * dir;
    });
    return sorted;
  }, [rows, query, sort, asc]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setAsc((v) => !v);
    else {
      setSort(key);
      setAsc(false);
    }
    setPage(0);
  };

  const th = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => (
    <th className={align === 'right' ? 'text-right' : 'text-left'}>
      <button type="button" className="tv-analytics-sort" onClick={() => toggleSort(key)}>
        {label}
        {sort === key ? (asc ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );

  if (rows.length === 0) {
    return (
      <div className="tv-analytics-empty">
        <p className="font-semibold text-[#18181b]">No listing performance yet</p>
        <p className="mt-1 text-[13px] text-[#71717a]">Paid bookings in this range will appear here by listing.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {searchEnabled ? (
        <input
          type="search"
          className="tv-input h-10 max-w-sm"
          placeholder="Search listings"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          aria-label="Search listings"
        />
      ) : null}
      <div className="hidden overflow-x-auto rounded-[10px] border border-[#e5e7eb] bg-white md:block">
        <table className="w-full min-w-[36rem] text-left text-[13px]">
          <thead className="border-b border-[#e5e7eb] text-[11px] font-semibold uppercase tracking-wide text-[#71717a]">
            <tr>
              {th('title', 'Listing')}
              <th className="px-3 py-2.5">Type</th>
              {mode === 'sales' ? th('gross', 'Gross', 'right') : null}
              {mode === 'sales' ? th('commission', 'Commission', 'right') : null}
              {th('net', mode === 'sales' ? 'Net earnings' : 'Net earnings', 'right')}
              {th('bookings', 'Bookings', 'right')}
              {mode !== 'sales' ? th('guests', 'Guests', 'right') : null}
              {mode === 'summary' ? th('share', 'Share', 'right') : null}
              {mode === 'bookings' ? (
                <th className="px-3 py-2.5 text-right">Cancel rate</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr
                key={`${row.listingId}-${row.currency}`}
                className="cursor-pointer border-t border-[#e5e7eb] hover:bg-[#f8fafc]"
                tabIndex={0}
                onClick={() => onOpenListing(row.listingId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenListing(row.listingId);
                  }
                }}
              >
                <td className="max-w-[16rem] truncate px-3 py-2.5 font-semibold text-[#18181b]">{row.title}</td>
                <td className="px-3 py-2.5 text-[#52525b]">{row.productType}</td>
                {mode === 'sales' ? (
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(row.gross, row.currency)}</td>
                ) : null}
                {mode === 'sales' ? (
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(row.commission, row.currency)}</td>
                ) : null}
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatMoney(row.net, row.currency)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{row.bookings}</td>
                {mode !== 'sales' ? (
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.guests}</td>
                ) : null}
                {mode === 'summary' ? (
                  <td className="px-3 py-2.5 text-right tabular-nums">{Math.round(row.shareOfNet * 100)}%</td>
                ) : null}
                {mode === 'bookings' ? (
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {row.cancellationRate == null ? '—' : `${Math.round(row.cancellationRate * 100)}%`}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-[#e5e7eb] overflow-hidden rounded-[10px] border border-[#e5e7eb] bg-white md:hidden">
        {pageRows.map((row) => (
          <li key={`${row.listingId}-${row.currency}`}>
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left"
              onClick={() => onOpenListing(row.listingId)}
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-[#18181b]">{row.title}</span>
                <span className="mt-0.5 block text-[12px] text-[#71717a]">
                  {row.productType} · {row.bookings} bookings · {row.guests} guests
                </span>
              </span>
              <span className="shrink-0 text-[13px] font-bold tabular-nums">{formatMoney(row.net, row.currency)}</span>
            </button>
          </li>
        ))}
      </ul>
      {pageCount > 1 ? (
        <div className="flex items-center justify-between text-[13px]">
          <button type="button" className="tv-btn-secondary h-9 px-3" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Previous
          </button>
          <span className="text-[#71717a]">
            {page + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="tv-btn-secondary h-9 px-3"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
