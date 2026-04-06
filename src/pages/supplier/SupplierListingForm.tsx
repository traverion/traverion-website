import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { TourPackage } from '../../types/tour';
import ListingDiscounts from '../../components/supplier/ListingDiscounts';
import { getListingPublishBlockers } from '../../lib/listingPublishGate';
import { computeListingQuality, listingQualityPercent } from '../../lib/listingQualityScore';

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
  defaultStartTime: string;
  pickupWindowMinutesBeforeMin: number;
  pickupWindowMinutesBeforeMax: number;
};

/**
 * Stored `destination` on the listing (DB + public cards). Optional custom label in the form;
 * otherwise derived from city/country, or "Various locations" for multi-stop / roaming tours.
 */
function resolveListingDestinationLabel(
  form: Pick<ListingFormState, 'destination' | 'city' | 'country'>
): string {
  const custom = form.destination.trim();
  if (custom) return custom;
  const city = form.city.trim();
  const country = form.country.trim();
  if (city && country) return `${city}, ${country}`;
  if (country) return country;
  if (city) return city;
  return 'Various locations';
}

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
  defaultStartTime: string;
  pickupWindowMinutesBeforeMin: number;
  pickupWindowMinutesBeforeMax: number;
}, existingId?: string): TourPackage {
  const id = existingId ?? `supplier-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const resolvedDestination = resolveListingDestinationLabel(form);
  return {
    id,
    title: form.title,
    destination: resolvedDestination,
    duration: form.duration,
    style: 'Tour',
    startLocation: form.city.trim() || resolvedDestination,
    endLocation: form.city.trim() || resolvedDestination,
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
      {
        day: 1,
        title: form.title,
        description: form.description,
        meals: 'None',
        location: form.city.trim() || resolvedDestination,
        activities: ['Tour'],
      },
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
    defaultStartTime: form.defaultStartTime.trim() || undefined,
    pickupWindowMinutesBeforeMin: form.pickupWindowMinutesBeforeMin,
    pickupWindowMinutesBeforeMax: Math.max(
      form.pickupWindowMinutesBeforeMin,
      form.pickupWindowMinutesBeforeMax
    ),
  };
}

function serializeListingFormState(f: ListingFormState): string {
  return JSON.stringify(f);
}

function isStepSatisfied(idx: number, form: ListingFormState): boolean {
  if (idx === 0) {
    return (
      form.title.trim().length > 0 &&
      form.country.trim().length > 0 &&
      form.duration.trim().length > 0
    );
  }
  if (idx === 1) return form.price > 0;
  if (idx === 2) return true;
  return form.description.trim().length > 0;
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
  defaultStartTime: '',
  pickupWindowMinutesBeforeMin: 0,
  pickupWindowMinutesBeforeMax: 30,
};

interface SupplierListingFormProps {
  editingId: string | null;
  existingListings: TourPackage[];
  onSave: (tour: TourPackage) => void | Promise<void>;
  /** When closing the sheet, persist a draft if the form changed (Supabase only; parent implements save). */
  enableDraftOnClose?: boolean;
  onSaveDraft?: (tour: TourPackage) => Promise<boolean>;
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
  enableDraftOnClose = false,
  onSaveDraft,
  onCancel,
  focusSection,
  onFocusConsumed,
}: SupplierListingFormProps) {
  const [form, setForm] = useState<ListingFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [publishBlockers, setPublishBlockers] = useState<string[] | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [draftCloseBusy, setDraftCloseBusy] = useState(false);
  const [draftCloseError, setDraftCloseError] = useState<string | null>(null);
  const lastFocused = useRef<string | null>(null);
  const stepContainerRef = useRef<HTMLDivElement | null>(null);
  const initialFormSnapshotRef = useRef<string>(serializeListingFormState(emptyForm));
  const closeIntentRunningRef = useRef(false);

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
      destination: 2,
      duration: 0,
      price: 1,
      published: 1,
      group: 1,
      tags: 1,
      cancellation: 2,
      meeting: 2,
      pickup: 2,
      schedule: 2,
      image: 3,
      description: 3,
    }),
    []
  );

  useEffect(() => {
    if (editingId) {
      const existing = existingListings.find(t => t.id === editingId);
      if (existing) {
        const next: ListingFormState = {
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
          defaultStartTime: existing.defaultStartTime ?? '',
          pickupWindowMinutesBeforeMin: existing.pickupWindowMinutesBeforeMin ?? 0,
          pickupWindowMinutesBeforeMax: existing.pickupWindowMinutesBeforeMax ?? 30,
        };
        initialFormSnapshotRef.current = serializeListingFormState(next);
        setForm(next);
      }
    } else {
      initialFormSnapshotRef.current = serializeListingFormState(emptyForm);
      setForm(emptyForm);
    }
  }, [editingId, existingListings]);

  useEffect(() => {
    lastFocused.current = null;
    setStepIdx(0);
  }, [editingId]);

  useEffect(() => {
    if (form.status === 'draft') setPublishBlockers(null);
  }, [form.status]);

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

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyLeft = body.style.left;
    const prevBodyRight = body.style.right;
    const prevBodyWidth = body.style.width;
    const scrollY = window.scrollY;
    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.left = prevBodyLeft;
      body.style.right = prevBodyRight;
      body.style.width = prevBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  const isDirty = useCallback(() => {
    return serializeListingFormState(form) !== initialFormSnapshotRef.current;
  }, [form]);

  const draftListingPreview = useMemo(() => {
    return buildListingFromForm(form, editingId ?? undefined);
  }, [form, editingId]);

  const listingQualityPct = useMemo(() => {
    const { score, maxScore } = computeListingQuality(draftListingPreview);
    return listingQualityPercent(score, maxScore);
  }, [draftListingPreview]);

  const publishBlockersPreview = useMemo(
    () => getListingPublishBlockers(draftListingPreview),
    [draftListingPreview]
  );

  const handleCloseIntent = useCallback(async () => {
    if (closeIntentRunningRef.current || submitting) return;
    setDraftCloseError(null);
    if (enableDraftOnClose && onSaveDraft && isDirty()) {
      closeIntentRunningRef.current = true;
      setDraftCloseBusy(true);
      try {
        const listing = buildListingFromForm({ ...form, status: 'draft' }, editingId ?? undefined);
        const ok = await onSaveDraft(listing);
        if (!ok) {
          setDraftCloseError('Could not save your draft. Check your connection and try again.');
          return;
        }
      } finally {
        setDraftCloseBusy(false);
        closeIntentRunningRef.current = false;
      }
    }
    onCancel();
  }, [enableDraftOnClose, onSaveDraft, isDirty, form, editingId, submitting, onCancel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      void handleCloseIntent();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleCloseIntent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.pickupWindowMinutesBeforeMax < form.pickupWindowMinutesBeforeMin) {
      setStepIdx(2);
      return;
    }
    const listing = buildListingFromForm(form, editingId ?? undefined);
    if (form.status === 'published') {
      const blockers = getListingPublishBlockers(listing);
      if (blockers.length > 0) {
        setPublishBlockers(blockers);
        setStepIdx(0);
        return;
      }
    }
    setPublishBlockers(null);
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

  const canContinueStep = () => isStepSatisfied(stepIdx, form);

  const shell = (
    <div
      className="fixed inset-0 z-[80] flex flex-col overflow-hidden overscroll-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supplier-listing-editor-title"
    >
      <button
        type="button"
        className="absolute inset-0 z-[80] bg-slate-900/35 backdrop-blur-md motion-safe:animate-fade-in supports-[backdrop-filter]:bg-slate-900/25 cursor-pointer border-0 p-0"
        aria-label="Close listing editor"
        onClick={() => void handleCloseIntent()}
      />
      <div className="relative z-[81] flex min-h-0 w-full flex-1 flex-col justify-end sm:justify-center px-0 py-0 sm:p-3 sm:px-4 pointer-events-none">
        <form
          onSubmit={handleSubmit}
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto motion-safe:animate-slide-up motion-reduce:animate-none flex min-h-0 w-full max-w-none flex-col overflow-hidden border-0 border-gray-200 bg-white shadow-2xl rounded-t-3xl sm:rounded-2xl sm:mx-auto h-[min(96dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] sm:h-[min(100dvh-1.5rem,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem))] sm:max-h-[min(100dvh-1.5rem,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem))] sm:max-w-4xl sm:border sm:border-gray-200"
        >
        <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0" aria-hidden>
          <div className="h-1.5 w-12 rounded-full bg-gray-300" />
        </div>
        <div className="shrink-0 border-b border-gray-200 px-5 py-4 sm:px-6">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="supplier-listing-editor-title" className="text-xl font-semibold text-gray-900">
                {editingId ? 'Edit listing' : 'Create listing'}
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                This is what travelers will see on Traverion once you publish. Close anytime — your work saves as a draft when
                you have unsaved changes.
              </p>
            </div>
            <button
              type="button"
              disabled={draftCloseBusy || submitting}
              onClick={() => void handleCloseIntent()}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {draftCloseBusy ? 'Saving…' : 'Close'}
            </button>
          </div>
          {draftCloseError && (
            <p className="mb-3 text-sm text-red-600 rounded-lg border border-red-200 bg-red-50 px-3 py-2">{draftCloseError}</p>
          )}
          <nav aria-label="Listing setup steps" className="mb-3">
            <ol className="flex items-center w-full list-none m-0 p-0 gap-0">
              {steps.map((step, idx) => {
                const done = isStepSatisfied(idx, form);
                const current = idx === stepIdx;
                return (
                  <li key={step.id} className="flex flex-1 items-center min-w-0 last:flex-none last:w-auto">
                    {idx > 0 && (
                      <div
                        className={`self-center h-0.5 flex-1 rounded-full min-w-[6px] mx-0.5 sm:mx-1 ${
                          isStepSatisfied(idx - 1, form) ? 'bg-finland/50' : 'bg-gray-200'
                        }`}
                        aria-hidden
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setStepIdx(idx)}
                      className="touch-manipulation flex flex-col items-center gap-1.5 min-w-[3.5rem] sm:min-w-[4.5rem] group"
                      aria-current={current ? 'step' : undefined}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold border-2 transition-colors ${
                          done
                            ? 'bg-finland text-white border-finland'
                            : current
                              ? 'border-finland bg-finland/10 text-finland'
                              : 'border-gray-200 bg-white text-gray-400 group-hover:border-gray-300'
                        }`}
                      >
                        {done ? '✓' : idx + 1}
                      </span>
                      <span
                        className={`text-[10px] sm:text-xs font-medium text-center leading-tight max-w-[4.5rem] sm:max-w-none ${
                          current ? 'text-finland' : 'text-gray-600'
                        }`}
                      >
                        {step.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-gray-700">
                Listing strength <span className="tabular-nums text-finland">{listingQualityPct}%</span>
              </p>
              <p className="text-xs text-gray-500">
                {publishBlockersPreview.length === 0
                  ? 'Meets basic publish checks — choose Published when you are ready.'
                  : `${publishBlockersPreview.length} item${publishBlockersPreview.length === 1 ? '' : 's'} left before publish`}
              </p>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-finland/80 transition-all duration-500 ease-out"
                style={{ width: `${listingQualityPct}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-400">
              Step {stepIdx + 1} of {steps.length} · progress reflects how complete your listing looks to guests
            </p>
          </div>
        </div>

        {publishBlockers && publishBlockers.length > 0 && (
          <div className="mx-4 shrink-0 sm:mx-6 mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-medium text-amber-900">Finish these before publishing</p>
            <ul className="mt-2 list-disc list-inside space-y-1">
              {publishBlockers.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setPublishBlockers(null)}
              className="mt-2 text-xs font-medium text-finland hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <div
          ref={stepContainerRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5"
        >
          {stepIdx === 0 && (
            <div className="space-y-4 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div id="supplier-listing-field-title">
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="supplier-listing-field-location">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland" placeholder="e.g. Rovaniemi — or leave blank if no fixed base" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country *</label>
                  <input type="text" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland" placeholder="e.g. Finland" required />
                </div>
              </div>
              <p className="text-xs text-gray-500 -mt-2">
                Roaming or multi-stop tours (e.g. Northern Lights) often have no single city — country alone is fine. You can add
                a custom route label under <span className="font-medium text-gray-700">Logistics</span>, and later we’ll add a
                fuller itinerary with stops and one-way / round-trip.
              </p>
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
              <div id="supplier-listing-field-destination">
                <label className="block text-sm font-medium text-gray-700 mb-1">How it shows as a place (optional)</label>
                <input
                  type="text"
                  value={form.destination}
                  onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                  placeholder="e.g. Finnish Lapland · multi-stop, Arctic route, or leave blank"
                />
                <p className="text-xs text-gray-500 mt-1">
                  If you skip this, we use city + country when both exist, otherwise country only, otherwise “Various locations”
                  on cards and search. Use this for routes that don’t fit a single city.
                </p>
              </div>
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
              <div id="supplier-listing-field-schedule" className="rounded-lg border border-gray-100 bg-gray-50/80 p-4 space-y-4">
                <p className="text-sm font-medium text-gray-900">Daily timing (optional)</p>
                <p className="text-xs text-gray-600">
                  Set the usual start time for this experience. After a customer books, you assign the exact pickup time within the window below (minutes before start).
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default start time</label>
                  <input
                    type="time"
                    value={form.defaultStartTime}
                    onChange={(e) => setForm((f) => ({ ...f, defaultStartTime: e.target.value }))}
                    className="w-full max-w-[12rem] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">Applied to each booked day unless you change it on the booking.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pickup window — earliest (minutes before start)</label>
                    <input
                      type="number"
                      min={0}
                      max={24 * 60}
                      value={form.pickupWindowMinutesBeforeMin}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, pickupWindowMinutesBeforeMin: Math.max(0, Number(e.target.value) || 0) }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pickup window — latest (minutes before start)</label>
                    <input
                      type="number"
                      min={0}
                      max={24 * 60}
                      value={form.pickupWindowMinutesBeforeMax}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, pickupWindowMinutesBeforeMax: Math.max(0, Number(e.target.value) || 0) }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                    />
                  </div>
                </div>
                {form.pickupWindowMinutesBeforeMax < form.pickupWindowMinutesBeforeMin && (
                  <p className="text-sm text-red-600">Latest pickup offset must be greater than or equal to the earliest.</p>
                )}
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

        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setStepIdx((s) => Math.max(0, s - 1))}
            disabled={stepIdx === 0 || draftCloseBusy || submitting}
            className="touch-manipulation w-full sm:w-auto px-4 py-3 sm:py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 min-h-[44px]"
          >
            Back
          </button>
          <div className="flex items-stretch sm:items-center gap-2 w-full sm:w-auto">
            {stepIdx < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => setStepIdx((s) => Math.min(steps.length - 1, s + 1))}
                disabled={!canContinueStep() || draftCloseBusy || submitting}
                className="touch-manipulation flex-1 sm:flex-none px-4 py-3 sm:py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50 min-h-[44px]"
              >
                Continue
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting || draftCloseBusy || !canContinueStep()}
                className="touch-manipulation flex-1 sm:flex-none px-4 py-3 sm:py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50 min-h-[44px]"
              >
                {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Add listing'}
              </button>
            )}
            <button
              type="button"
              disabled={draftCloseBusy || submitting}
              onClick={() => void handleCloseIntent()}
              className="touch-manipulation flex-1 sm:flex-none px-4 py-3 sm:py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 min-h-[44px] disabled:opacity-50"
            >
              {draftCloseBusy ? 'Saving draft…' : 'Cancel'}
            </button>
          </div>
        </div>
      </form>
      </div>
    </div>
  );

  return createPortal(shell, document.body);
}
