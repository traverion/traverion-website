import { useState, useEffect } from 'react';
import { Percent, DollarSign, Trash2, Plus } from 'lucide-react';
import {
  fetchDiscountsByListingId,
  insertDiscount,
  deleteDiscount,
  ListingDiscount,
  ListingDiscountInsert,
} from '../../data/supabase-discounts';
import { isSupabaseConfigured } from '../../lib/supabase';

interface ListingDiscountsProps {
  listingId: string;
}

export default function ListingDiscounts({ listingId }: ListingDiscountsProps) {
  const [discounts, setDiscounts] = useState<ListingDiscount[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');

  const load = () => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    fetchDiscountsByListingId(listingId).then((data) => {
      setDiscounts(data);
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
  }, [listingId]);

  const handleAdd = async () => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) return;
    if (type === 'percent' && num > 100) return;
    const inserted = await insertDiscount({
      listing_id: listingId,
      type,
      value: num,
      code: code.trim() || null,
      valid_from: validFrom || null,
      valid_until: validUntil || null,
    });
    if (inserted) {
      setValue('');
      setCode('');
      setValidFrom('');
      setValidUntil('');
      setAdding(false);
      load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remove this discount?')) return;
    const ok = await deleteDiscount(id);
    if (ok) load();
  };

  if (!isSupabaseConfigured()) return null;

  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900">Special discounts</h3>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-sm text-finland hover:text-finland-dark flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {discounts.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm"
            >
              <span>
                {d.type === 'percent' ? (
                  <Percent className="w-4 h-4 inline mr-1 text-gray-500" />
                ) : (
                  <DollarSign className="w-4 h-4 inline mr-1 text-gray-500" />
                )}
                {d.type === 'percent' ? `${d.value}%` : `${d.value} off`}
                {d.code && <span className="ml-2 text-gray-500">Code: {d.code}</span>}
                {(d.valid_from || d.valid_until) && (
                  <span className="ml-2 text-gray-400 text-xs">
                    {d.valid_from ?? '…'} – {d.valid_until ?? '…'}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(d.id)}
                className="p-1 text-red-500 hover:bg-red-50 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg space-y-2">
          <div className="flex gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'percent' | 'fixed')}
              className="border border-gray-200 rounded px-2 py-1.5 text-sm"
            >
              <option value="percent">Percent</option>
              <option value="fixed">Fixed amount</option>
            </select>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === 'percent' ? 'e.g. 10' : 'e.g. 5'}
              min="0"
              step={type === 'percent' ? 1 : 0.01}
              className="border border-gray-200 rounded px-2 py-1.5 text-sm w-24"
            />
          </div>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Promo code (optional)"
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              placeholder="From"
              className="border border-gray-200 rounded px-2 py-1.5 text-sm flex-1"
            />
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              placeholder="Until"
              className="border border-gray-200 rounded px-2 py-1.5 text-sm flex-1"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(false)} className="text-sm text-gray-600">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              className="text-sm px-3 py-1.5 rounded bg-finland text-white hover:bg-finland-dark"
            >
              Save discount
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
