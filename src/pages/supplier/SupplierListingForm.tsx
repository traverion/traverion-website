import { useState, useEffect, useRef, useMemo } from 'react';
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

type StepId = 'basics' | 'commercial' | 'logistics' | 'content';

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
  const [stepIdx, setStepIdx] = useState(0);
  const lastFocused = useRef<string | null>(null);
  const stepContainerRef = useRef<HTMLDivElement | null>(null);

  const steps = useMemo(
    () => [
      { id: 'basics' as StepId, label: 'Basics' },
      { id: 'commercial' as StepId, label: 'Pricing' },
      { id: 'logistics' as StepId, label: 'Logistics' },
      { id: 'content' as StepId, label: 'Content' },
    ],
    []
  );

  const focusToStep: Record<string, number> = useMemo(
    () => ({
      title: 0,
      location: 0,
      destination: 0,
      duration: 0,
      price: 1,
      published: 1,
      group: 1,
      tags: 1,
      cancellation: 2,
      meeting: 2,
      pickup: 2,
      image: 3,
      description: 3,
    }),
    []
  );

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
    setStepIdx(0);
  }, [editingId]);

  useEffect(() => {
    if (!focusSection || !editingId) return;
    const targetStep = focusToStep[focusSection];
    if (typeof targetStep === 'number') {
      setStepIdx(targetStep);
    }
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
  }, [focusSection, editingId, onFocusConsumed, focusToStep]);

  useEffect(() => {
    if (!stepContainerRef.current) return;
    stepContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  }, [stepIdx]);

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

  const canContinueStep = () => {
    if (stepIdx === 0) return form.title.trim().length > 0 && form.country.trim().length > 0 && form.destination.trim().length > 0 && form.duration.trim().length > 0;
    if (stepIdx === 1) return form.price > 0;
    if (stepIdx === 2) return true;
    return form.description.trim().length > 0;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm p-3 sm:p-6">
      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl shadow-xl w-full max-w-3xl mx-auto h-[calc(100vh-24px)] sm:h-[calc(100vh-48px)] flex flex-col">
        <div className="px-5 sm:px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-semibold text-gray-900">{editingId ? 'Edit listing' : 'Create listing'}</h2>
            <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
              Close
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {steps.map((step, idx) => (
              <button
                key={step.id}
                type="button"
                onClick={() => setStepIdx(idx)}
                className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-left ${
                  idx === stepIdx ? 'border-finland bg-finland/5 text-finland' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-semibold ${idx === stepIdx ? 'bg-finland text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {idx + 1}
                </span>
                <span className="text-xs sm:text-sm font-medium truncate">{step.label}</span>
              </button>
            ))}
          </div>
          <div className="mt-3">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-finland transition-all duration-500 ease-out"
                style={{ width: `${((stepIdx + 1) / steps.length) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">Step {stepIdx + 1} of {steps.length}</p>
          </div>
        </div>

        <div ref={stepContainerRef} className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1">
          {stepIdx === 0 && (
            <div className="space-y-4 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div id="supplier-listing-field-title">
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="supplier-listing-field-location">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland" placeholder="e.g. Barcelona" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country *</label>
                  <input type="text" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland" placeholder="e.g. Spain" required />
                </div>
              </div>
              <div id="supplier-listing-field-destination">
                <label className="block text-sm font-medium text-gray-700 mb-1">Destination (short) *</label>
                <input type="text" value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland" placeholder="e.g. Barcelona, Spain" required />
              </div>
              <div id="supplier-listing-field-duration">
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration *</label>
                <input type="text" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland" placeholder="e.g. 3 hours or 1 day" required />
              </div>
            </div>
          )}

          {stepIdx === 1 && (
            <div className="space-y-4 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div id="supplier-listing-field-price">
                <label className="block text-sm font-medium text-gray-700 mb-1">Price from (USD) *</label>
                <input type="number" min={0} value={form.price || ''} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) || 0 }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland" required />
              </div>
              <div id="supplier-listing-field-published">
                <label className="block text-sm font-medium text-gray-700 mb-1">Visibility</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as 'draft' | 'published' }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white">
                  <option value="draft">Draft (hidden from main site)</option>
                  <option value="published">Published (visible to travelers)</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="supplier-listing-field-group">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Group size</label>
                  <input type="text" value={form.groupSize} onChange={e => setForm(f => ({ ...f, groupSize: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland" placeholder="e.g. 2-12 People" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
                  <select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value as 'Easy' | 'Moderate' | 'Challenging' }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white">
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
                      <input type="checkbox" checked={form.tags.includes(tag.id)} onChange={() => toggleTag(tag.id)} className="rounded border-gray-300 text-finland focus:ring-finland" />
                      <span className="text-sm text-gray-700">{tag.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {stepIdx === 2 && (
            <div className="space-y-4 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div id="supplier-listing-field-cancellation">
                <label className="block text-sm font-medium text-gray-700 mb-1">Cancellation policy</label>
                <input type="text" value={form.cancellationPolicy} onChange={e => setForm(f => ({ ...f, cancellationPolicy: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland" placeholder="e.g. Free cancellation up to 24 hours before" />
              </div>
              <div id="supplier-listing-field-meeting">
                <label className="block text-sm font-medium text-gray-700 mb-1">Meeting point / pickup location</label>
                <input type="text" value={form.meetingPoint} onChange={e => setForm(f => ({ ...f, meetingPoint: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland" placeholder="e.g. Hotel lobby, 9:00 AM" />
              </div>
              <div id="supplier-listing-field-pickup">
                <label className="block text-sm font-medium text-gray-700 mb-1">Pickup instructions</label>
                <textarea value={form.pickupInstructions} onChange={e => setForm(f => ({ ...f, pickupInstructions: e.target.value }))} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland" placeholder="Instructions for the guest" />
              </div>
            </div>
          )}

          {stepIdx === 3 && (
            <div className="space-y-4 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div id="supplier-listing-field-image">
                <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                <input type="url" value={form.image} onChange={e => setForm(f => ({ ...f, image: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland" placeholder="https://example.com/your-tour-image.jpg" />
                <p className="text-xs text-gray-500 mt-1">Paste a direct link to your tour image.</p>
              </div>
              <div id="supplier-listing-field-description">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={6} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland" required />
              </div>
              {editingId && (
                <div className="mt-2 border-t border-gray-100 pt-4">
                  <p className="text-sm font-medium text-gray-900 mb-3">Discounts</p>
                  <ListingDiscounts listingId={editingId} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStepIdx((s) => Math.max(0, s - 1))}
            disabled={stepIdx === 0}
            className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            {stepIdx < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => setStepIdx((s) => Math.min(steps.length - 1, s + 1))}
                disabled={!canContinueStep()}
                className="px-4 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50"
              >
                Continue
              </button>
            ) : (
              <button type="submit" disabled={submitting || !canContinueStep()} className="px-4 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50">
                {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Add listing'}
              </button>
            )}
            <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
