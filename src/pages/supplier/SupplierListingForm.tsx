import { useState, useEffect, useRef } from 'react';
import { TourPackage } from '../../types/tour';
import ListingDiscounts from '../../components/supplier/ListingDiscounts';

const TAG_OPTIONS = [
  { id: 'free-cancellation', label: 'Free cancellation' },
  { id: 'small-group', label: 'Small group' },
  { id: 'pickup-available', label: 'Pickup available' },
  { id: 'mobile-ticket', label: 'Mobile ticket' },
  { id: 'bestseller', label: 'Bestseller' },
];

type ListingFormState = {
  title: string;
  destination: string;
  duration: string;
  price: number;
  image: string;
  description: string;
  city: string;
  country: string;
  tags: string[];
  groupSize: string;
  difficulty: 'Easy' | 'Moderate' | 'Challenging';
  status: 'draft' | 'published';
  cancellationPolicy: string;
  meetingPoint: string;
  pickupInstructions: string;
};

function buildListingFromForm(form: {
  title: string;
  destination: string;
  duration: string;
  price: number;
  image: string;
  description: string;
  city: string;
  country: string;
  tags: string[];
  groupSize: string;
  difficulty: 'Easy' | 'Moderate' | 'Challenging';
  status: 'draft' | 'published';
  cancellationPolicy: string;
  meetingPoint: string;
  pickupInstructions: string;
}, existingId?: string): TourPackage {
  const id = existingId ?? `supplier-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    title: form.title,
    destination: form.destination,
    duration: form.duration,
    style: 'Tour',
    startLocation: form.city || form.destination,
    endLocation: form.city || form.destination,
    price: {
      startingFrom: form.price,
      currency: 'USD',
      perPerson: true,
      twinOccupancy: false,
      customQuote: false,
      singleSupplement: 0,
      validity: 'Year round',
    },
    category: '3*',
    tourType: 'cultural',
    validity: 'Year round',
    image: form.image || 'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg',
    description: form.description,
    highlights: form.description ? [form.description.slice(0, 80) + '…'] : [],
    itinerary: [
      { day: 1, title: form.title, description: form.description, meals: 'None', location: form.city || form.destination, activities: ['Tour'] },
    ],
    includes: ['Guide', 'As described'],
    excludes: ['Personal expenses'],
    hotels: [],
    difficulty: form.difficulty,
    groupSize: form.groupSize || '2-12 People',
    bestTime: 'Year round',
    rating: 4.5,
    reviews: 0,
    isPopular: false,
    city: form.city || undefined,
    country: form.country || undefined,
    tags: form.tags.length ? form.tags : undefined,
    supplierId: 'current',
    status: form.status,
    cancellationPolicy: form.cancellationPolicy.trim() || undefined,
    meetingPoint: form.meetingPoint.trim() || undefined,
    pickupInstructions: form.pickupInstructions.trim() || undefined,
  };
}

const emptyForm: ListingFormState = {
  title: '',
  destination: '',
  duration: '',
  price: 0,
  image: '',
  description: '',
  city: '',
  country: '',
  tags: [] as string[],
  groupSize: '2-12 People',
  difficulty: 'Easy',
  status: 'draft',
  cancellationPolicy: '',
  meetingPoint: '',
  pickupInstructions: '',
};

interface SupplierListingFormProps {
  editingId: string | null;
  existingListings: TourPackage[];
  onSave: (tour: TourPackage) => void | Promise<void>;
  onCancel: () => void;
  /** Deep link: scroll/focus this section (see supplier-listing-field-* ids). */
  focusSection?: string | null;
  onFocusConsumed?: () => void;
}

export default function SupplierListingForm({
  editingId,
  existingListings,
  onSave,
  onCancel,
  focusSection,
  onFocusConsumed,
}: SupplierListingFormProps) {
  const [form, setForm] = useState<ListingFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const lastFocused = useRef<string | null>(null);

  useEffect(() => {
    if (editingId) {
      const existing = existingListings.find(t => t.id === editingId);
      if (existing) {
        setForm({
          title: existing.title,
          destination: existing.destination,
          duration: existing.duration,
          price: existing.price.startingFrom,
          image: existing.image,
          description: existing.description,
          city: existing.city ?? '',
          country: existing.country ?? '',
          tags: existing.tags ?? [],
          groupSize: existing.groupSize,
          difficulty: existing.difficulty,
          status: existing.status ?? 'published',
          cancellationPolicy: existing.cancellationPolicy ?? '',
          meetingPoint: existing.meetingPoint ?? '',
          pickupInstructions: existing.pickupInstructions ?? '',
        });
      }
    } else {
      setForm(emptyForm);
    }
  }, [editingId, existingListings]);

  useEffect(() => {
    lastFocused.current = null;
  }, [editingId]);

  useEffect(() => {
    if (!focusSection || !editingId) return;
    if (lastFocused.current === `${editingId}:${focusSection}`) return;
    const el = document.getElementById(`supplier-listing-field-${focusSection}`);
    if (!el) return;
    lastFocused.current = `${editingId}:${focusSection}`;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusable = el.querySelector<HTMLElement>('input, textarea, select, button');
      focusable?.focus?.();
    });
    onFocusConsumed?.();
  }, [focusSection, editingId, onFocusConsumed]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const listing = buildListingFromForm(form, editingId ?? undefined);
    setSubmitting(true);
    try {
      await onSave(listing);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTag = (id: string) => {
    setForm(prev => ({
      ...prev,
      tags: prev.tags.includes(id) ? prev.tags.filter(t => t !== id) : [...prev.tags, id],
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 max-w-2xl">
      <h2 className="text-xl font-semibold text-gray-900">{editingId ? 'Edit listing' : 'New listing'}</h2>
      <div id="supplier-listing-field-title">
        <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
        <input
          type="text"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
          required
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="supplier-listing-field-location">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
          <input
            type="text"
            value={form.city}
            onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
            placeholder="e.g. Barcelona"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Country *</label>
          <input
            type="text"
            value={form.country}
            onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
            placeholder="e.g. Spain"
            required
          />
        </div>
      </div>
      <div id="supplier-listing-field-destination">
        <label className="block text-sm font-medium text-gray-700 mb-1">Destination (short) *</label>
        <input
          type="text"
          value={form.destination}
          onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
          placeholder="e.g. Barcelona, Spain"
          required
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div id="supplier-listing-field-duration">
          <label className="block text-sm font-medium text-gray-700 mb-1">Duration *</label>
          <input
            type="text"
            value={form.duration}
            onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
            placeholder="e.g. 3 hours or 1 day"
            required
          />
        </div>
        <div id="supplier-listing-field-price">
          <label className="block text-sm font-medium text-gray-700 mb-1">Price from (USD) *</label>
          <input
            type="number"
            min={0}
            value={form.price || ''}
            onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) || 0 }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
            required
          />
        </div>
      </div>
      <div id="supplier-listing-field-image">
        <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
        <input
          type="url"
          value={form.image}
          onChange={e => setForm(f => ({ ...f, image: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
          placeholder="https://example.com/your-tour-image.jpg"
        />
        <p className="text-xs text-gray-500 mt-1">Paste a direct link to your tour image. For uploads, use an image host (e.g. Imgur) or your own URL.</p>
      </div>
      <div id="supplier-listing-field-cancellation">
        <label className="block text-sm font-medium text-gray-700 mb-1">Cancellation policy</label>
        <input
          type="text"
          value={form.cancellationPolicy}
          onChange={e => setForm(f => ({ ...f, cancellationPolicy: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
          placeholder="e.g. Free cancellation up to 24 hours before"
        />
      </div>
      <div id="supplier-listing-field-meeting">
        <label className="block text-sm font-medium text-gray-700 mb-1">Meeting point / pickup location</label>
        <input
          type="text"
          value={form.meetingPoint}
          onChange={e => setForm(f => ({ ...f, meetingPoint: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
          placeholder="e.g. Hotel lobby, 9:00 AM"
        />
      </div>
      <div id="supplier-listing-field-pickup">
        <label className="block text-sm font-medium text-gray-700 mb-1">Pickup instructions</label>
        <textarea
          value={form.pickupInstructions}
          onChange={e => setForm(f => ({ ...f, pickupInstructions: e.target.value }))}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
          placeholder="Instructions for the guest"
        />
      </div>
      <div id="supplier-listing-field-published">
        <label className="block text-sm font-medium text-gray-700 mb-1">Visibility</label>
        <select
          value={form.status}
          onChange={e => setForm(f => ({ ...f, status: e.target.value as 'draft' | 'published' }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
        >
          <option value="draft">Draft (hidden from main site)</option>
          <option value="published">Published (visible to travelers)</option>
        </select>
      </div>
      <div id="supplier-listing-field-description">
        <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
        <textarea
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
          required
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="supplier-listing-field-group">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Group size</label>
          <input
            type="text"
            value={form.groupSize}
            onChange={e => setForm(f => ({ ...f, groupSize: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
            placeholder="e.g. 2-12 People"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
          <select
            value={form.difficulty}
            onChange={e => setForm(f => ({ ...f, difficulty: e.target.value as 'Easy' | 'Moderate' | 'Challenging' }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
          >
            <option value="Easy">Easy</option>
            <option value="Moderate">Moderate</option>
            <option value="Challenging">Challenging</option>
          </select>
        </div>
      </div>
      <div id="supplier-listing-field-tags">
        <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
        <div className="flex flex-wrap gap-2">
          {TAG_OPTIONS.map(tag => (
            <label key={tag.id} className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={form.tags.includes(tag.id)}
                onChange={() => toggleTag(tag.id)}
                className="rounded border-gray-300 text-finland focus:ring-finland"
              />
              <span className="text-sm text-gray-700">{tag.label}</span>
            </label>
          ))}
        </div>
      </div>
      {editingId && (
        <div className="mt-6">
          <ListingDiscounts listingId={editingId} />
        </div>
      )}
      <div className="flex gap-3 pt-4">
        <button type="submit" disabled={submitting} className="px-4 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50">
          {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Add listing'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  );
}
