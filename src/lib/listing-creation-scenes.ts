import { MIN_LISTING_DESCRIPTION_LENGTH } from './listingQualityScore';

/** Guided scenes inside Tour → Basics. Stay Basics stays a single page. */
export const TOUR_BASICS_SCENES = [
  { id: 'product_type', label: 'Product type', question: 'What are you creating?' },
  { id: 'identity', label: 'Identity', question: 'Give your tour an identity' },
  { id: 'story', label: 'Story', question: 'Tell travelers why they should choose it' },
] as const;

export type TourBasicsSceneId = (typeof TOUR_BASICS_SCENES)[number]['id'];

export const TOUR_BASICS_SCENE_COUNT = TOUR_BASICS_SCENES.length;
export const TOUR_BASICS_SUBTITLE_MAX = 300;
export const TOUR_BASICS_DESCRIPTION_MAX = 2000;
export const TOUR_HIGHLIGHT_MIN_VISIBLE = 2;
export const TOUR_HIGHLIGHT_MAX = 6;
export const TOUR_IDENTITY_PREVIEW_SUBTITLE_CLAMP = 160;

export const TOUR_PRODUCT_TYPE_OPTIONS: {
  id: 'tour' | 'ticket' | 'transportation';
  title: string;
  description: string;
}[] = [
  {
    id: 'tour',
    title: 'Tour or activity',
    description: 'Guided walks, day trips, experiences with a host, boat trips, food tours, and similar.',
  },
  {
    id: 'ticket',
    title: 'Ticket or entry',
    description: 'Museum passes, attraction entry, shows, skip-the-line access — mainly admission, not a guided route.',
  },
  {
    id: 'transportation',
    title: 'Transportation',
    description: 'Transfers, shuttles, private rides, or getting guests from A to B as the main product.',
  },
];

export type TourBasicsFields = {
  experienceKind: string;
  experienceLanguage: string;
  title: string;
  subtitle: string;
  description: string;
};

export type ListingCreationSceneDirection = 'forward' | 'back';

export function clampTourBasicsSceneIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(TOUR_BASICS_SCENE_COUNT - 1, Math.trunc(index)));
}

export function nextTourBasicsScene(index: number): number {
  return clampTourBasicsSceneIndex(index + 1);
}

export function previousTourBasicsScene(index: number): number {
  return clampTourBasicsSceneIndex(index - 1);
}

export function isTourProductTypeSatisfied(fields: Pick<TourBasicsFields, 'experienceKind'>): boolean {
  return (
    fields.experienceKind === 'tour' ||
    fields.experienceKind === 'ticket' ||
    fields.experienceKind === 'transportation'
  );
}

export function isTourIdentitySatisfied(
  fields: Pick<TourBasicsFields, 'experienceLanguage' | 'title' | 'subtitle'>
): boolean {
  const sub = fields.subtitle.trim();
  return (
    fields.experienceLanguage.trim().length > 0 &&
    fields.title.trim().length > 0 &&
    sub.length > 0 &&
    sub.length <= TOUR_BASICS_SUBTITLE_MAX
  );
}

export function isTourStorySatisfied(fields: Pick<TourBasicsFields, 'description'>): boolean {
  const desc = fields.description.trim();
  return desc.length >= MIN_LISTING_DESCRIPTION_LENGTH && desc.length <= TOUR_BASICS_DESCRIPTION_MAX;
}

/** Same truth as Tour Basics Continue-to-Details / isStepSatisfied(0). Highlights stay optional. */
export function isTourBasicsComplete(fields: TourBasicsFields): boolean {
  return isTourProductTypeSatisfied(fields) && isTourIdentitySatisfied(fields) && isTourStorySatisfied(fields);
}

export function isTourBasicsSceneSatisfied(sceneIndex: number, fields: TourBasicsFields): boolean {
  const idx = clampTourBasicsSceneIndex(sceneIndex);
  if (idx === 0) return isTourProductTypeSatisfied(fields);
  if (idx === 1) return isTourIdentitySatisfied(fields);
  return isTourStorySatisfied(fields);
}

export function canAdvanceTourBasicsScene(sceneIndex: number, fields: TourBasicsFields): boolean {
  const idx = clampTourBasicsSceneIndex(sceneIndex);
  if (idx < TOUR_BASICS_SCENE_COUNT - 1) return isTourBasicsSceneSatisfied(idx, fields);
  return isTourBasicsComplete(fields);
}

export function tourBasicsSceneForFocusSection(section: string | null | undefined): number | null {
  if (!section) return null;
  if (section === 'category' || section === 'kind') return 0;
  if (section === 'language' || section === 'title' || section === 'subtitle') return 1;
  if (section === 'description' || section === 'highlights') return 2;
  return null;
}

export function canSelectTourBasicsScene(
  targetIndex: number,
  currentIndex: number,
  fields: TourBasicsFields,
  isEditing: boolean
): boolean {
  const target = clampTourBasicsSceneIndex(targetIndex);
  const current = clampTourBasicsSceneIndex(currentIndex);
  if (target === current) return true;
  if (isEditing) return true;
  if (target < current) return true;
  for (let i = 0; i < target; i += 1) {
    if (!isTourBasicsSceneSatisfied(i, fields)) return false;
  }
  return true;
}

export function initialTourBasicsSceneIndex(input: {
  stored: number | null;
  isEditing: boolean;
  focusSection?: string | null;
  productTypeSelected: boolean;
}): number {
  const focused = tourBasicsSceneForFocusSection(input.focusSection ?? null);
  if (focused !== null) return focused;
  if (input.stored !== null) {
    const stored = clampTourBasicsSceneIndex(input.stored);
    // Existing listings must not reopen on product type just because sessionStorage
    // recorded the mount default (0). Restore identity/story; product type stays one Back away.
    if (input.isEditing && input.productTypeSelected && stored === 0) return 1;
    return stored;
  }
  if (input.isEditing && input.productTypeSelected) return 1;
  return 0;
}

export function listingCreationSceneCopy(index: number, total: number): string {
  if (total <= 0) return '';
  return `${index + 1} / ${total}`;
}

export function normalizeTourHighlightSlots(fromDb: string[] | undefined | null): string[] {
  const base = Array.isArray(fromDb) ? fromDb.map((s) => String(s ?? '')) : [];
  const out = base.slice(0, TOUR_HIGHLIGHT_MAX);
  while (out.length < TOUR_HIGHLIGHT_MIN_VISIBLE) out.push('');
  return out;
}

export function canAddTourHighlight(slots: readonly string[]): boolean {
  return slots.length < TOUR_HIGHLIGHT_MAX;
}

export function addTourHighlight(slots: readonly string[]): string[] {
  if (!canAddTourHighlight(slots)) return [...slots];
  return [...slots, ''];
}

export function removeTourHighlight(slots: readonly string[], index: number): string[] {
  if (index < TOUR_HIGHLIGHT_MIN_VISIBLE) {
    return slots.map((value, i) => (i === index ? '' : value));
  }
  const next = slots.filter((_, i) => i !== index);
  return normalizeTourHighlightSlots(next);
}

export function persistableTourHighlights(slots: readonly string[]): string[] {
  return slots.map((s) => s.trim()).filter(Boolean).slice(0, TOUR_HIGHLIGHT_MAX);
}

/** Preview-only clamp. Does not mutate the supplier field. */
export function identityPreviewSubtitle(subtitle: string): string {
  const text = subtitle.trim();
  if (text.length <= TOUR_IDENTITY_PREVIEW_SUBTITLE_CLAMP) return text;
  return `${text.slice(0, TOUR_IDENTITY_PREVIEW_SUBTITLE_CLAMP).trimEnd()}…`;
}
