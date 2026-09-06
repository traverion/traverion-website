import { BRAND_LOGO_SRC } from './brandAssets';

/** Base URL for canonical and OG. Prefer env in production. */
const getBaseUrl = () =>
  (typeof window !== 'undefined' && window.location.origin) || 'https://www.traverion.com';

/** Set document title and meta description. Call from App or page components. */
export function setPageMeta(title: string, description?: string) {
  if (typeof document === 'undefined') return;
  document.title = title ? `${title} · Traverion` : 'Traverion – Tours & Activities Worldwide';
  const meta = document.querySelector('meta[name="description"]');
  if (meta && description) meta.setAttribute('content', description);
}

/** Optional OG/Twitter overrides. If not set, falls back to title/description. */
export type OgMeta = {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
};

const OG_KEYS: { key: string; attr: string }[] = [
  { key: 'og:title', attr: 'property' },
  { key: 'og:description', attr: 'property' },
  { key: 'og:image', attr: 'property' },
  { key: 'og:url', attr: 'property' },
  { key: 'og:type', attr: 'property' },
  { key: 'twitter:title', attr: 'name' },
  { key: 'twitter:description', attr: 'name' },
  { key: 'twitter:image', attr: 'name' },
];

function ensureMeta(name: string, attr: 'name' | 'property'): HTMLMetaElement {
  const sel = attr === 'name' ? `meta[name="${name}"]` : `meta[property="${name}"]`;
  let el = document.querySelector<HTMLMetaElement>(sel);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  return el;
}

/** Set page meta and optionally Open Graph / Twitter Card tags (for sharing and SEO). */
export function setPageMetaWithOg(title: string, description?: string, og?: OgMeta) {
  if (typeof document === 'undefined') return;
  const t = og?.title ?? title;
  const d = og?.description ?? description ?? '';
  const baseUrl = getBaseUrl();
  const url = og?.url ?? (typeof window !== 'undefined' ? window.location.href : baseUrl);
  const image = og?.image ?? `${baseUrl}${BRAND_LOGO_SRC}`;
  const type = og?.type ?? 'website';

  document.title = title ? `${title} · Traverion` : 'Traverion – Tours & Activities Worldwide';
  const descMeta = document.querySelector('meta[name="description"]');
  if (descMeta && (description ?? d)) descMeta.setAttribute('content', description ?? d);

  ensureMeta('og:title', 'property').setAttribute('content', t ? `${t} · Traverion` : 'Traverion – Tours & Activities Worldwide');
  ensureMeta('og:description', 'property').setAttribute('content', d);
  ensureMeta('og:image', 'property').setAttribute('content', image);
  ensureMeta('og:url', 'property').setAttribute('content', url);
  ensureMeta('og:type', 'property').setAttribute('content', type);
  ensureMeta('twitter:title', 'name').setAttribute('content', t ? `${t} · Traverion` : 'Traverion');
  ensureMeta('twitter:description', 'name').setAttribute('content', d);
  ensureMeta('twitter:image', 'name').setAttribute('content', image);
}

/** Strongest practical directive for non-public app surfaces (staff tools, etc.). */
const NON_INDEX_ROBOTS =
  'noindex, nofollow, noarchive, nosnippet, noimageindex, max-snippet:0, max-image-preview:none';

/** Hide sensitive routes from search engines (SPA: toggle when entering/leaving the route). */
export function setRobotsNoIndex(enabled: boolean) {
  if (typeof document === 'undefined') return;
  if (enabled) {
    ensureMeta('robots', 'name').setAttribute('content', NON_INDEX_ROBOTS);
    ensureMeta('googlebot', 'name').setAttribute('content', NON_INDEX_ROBOTS);
  } else {
    document.querySelector('meta[name="robots"]')?.remove();
    document.querySelector('meta[name="googlebot"]')?.remove();
  }
}

/** Title/meta/OG without the public “ · Traverion” suffix (non-discoverable routes). */
export function setPrivateAppRouteHead(title: string, description: string) {
  if (typeof document === 'undefined') return;
  document.title = title;
  const descMeta = document.querySelector('meta[name="description"]');
  if (descMeta) descMeta.setAttribute('content', description);
  const href = typeof window !== 'undefined' ? window.location.href : getBaseUrl();
  ensureMeta('og:title', 'property').setAttribute('content', title);
  ensureMeta('og:description', 'property').setAttribute('content', description);
  ensureMeta('og:url', 'property').setAttribute('content', href);
  ensureMeta('og:type', 'property').setAttribute('content', 'website');
  ensureMeta('twitter:title', 'name').setAttribute('content', title);
  ensureMeta('twitter:description', 'name').setAttribute('content', description);
}

export function removeCanonicalLink() {
  if (typeof document === 'undefined') return;
  document.querySelector('link[rel="canonical"]')?.remove();
}

export function clearOrganizationJsonLd() {
  if (typeof document === 'undefined') return;
  document.getElementById('traverion-org-jsonld')?.remove();
}

/** Inject JSON-LD for a single tour (Product schema). Call from tour detail page. */
export function setTourJsonLd(tour: {
  id: string;
  title: string;
  description: string;
  image?: string;
  destination?: string;
  duration?: string;
  rating?: number;
  reviews?: number;
  price?: { startingFrom?: number; currency?: string };
}) {
  if (typeof document === 'undefined') return;
  const scriptId = 'traverion-tour-jsonld';
  let script = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.id = scriptId;
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/packages`;
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${baseUrl}/#/tour/${tour.id}`,
    name: tour.title,
    description: (tour.description || '').slice(0, 500),
    image: tour.image || `${baseUrl}${BRAND_LOGO_SRC}`,
    url,
    ...(tour.destination && { destination: tour.destination }),
    ...(tour.rating != null && { aggregateRating: { '@type': 'AggregateRating', ratingValue: tour.rating, reviewCount: tour.reviews ?? 0 } }),
    ...(tour.price?.startingFrom != null && {
      offers: {
        '@type': 'Offer',
        price: tour.price.startingFrom,
        priceCurrency: tour.price.currency ?? 'USD',
      },
    }),
  });
}

/** Inject JSON-LD for a list of tours (schema.org Product). */
export function setListingsJsonLd(listings: { id: string; name: string; description: string; image?: string; url?: string }[]) {
  if (typeof document === 'undefined' || !listings.length) return;
  const scriptId = 'traverion-listings-jsonld';
  let script = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.id = scriptId;
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  const baseUrl = getBaseUrl();
  const items = listings.slice(0, 20).map((item) => ({
    '@type': 'Product',
    '@id': `${baseUrl}/#/tour/${item.id}`,
    name: item.name,
    description: (item.description || '').slice(0, 500),
    image: item.image || `${baseUrl}${BRAND_LOGO_SRC}`,
    url: item.url ?? `${baseUrl}/packages`,
  }));
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': items,
  });
}

/** Remove tour JSON-LD (e.g. when leaving tour detail page). */
export function clearTourJsonLd() {
  const script = document.getElementById('traverion-tour-jsonld');
  if (script) script.remove();
}

/** Set canonical URL for the current page (helps SEO avoid duplicate content). */
export function setCanonicalUrl(path: string, search?: string) {
  if (typeof document === 'undefined') return;
  const baseUrl = getBaseUrl();
  const canonical = search ? `${baseUrl}${path}?${search}` : `${baseUrl}${path}`;
  let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = canonical;
}

/** Inject Organization JSON-LD once (site-wide). Call on app mount. */
export function setOrganizationJsonLd() {
  if (typeof document === 'undefined') return;
  const scriptId = 'traverion-org-jsonld';
  if (document.getElementById(scriptId)) return;
  const baseUrl = getBaseUrl();
  const script = document.createElement('script');
  script.id = scriptId;
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Traverion',
    url: baseUrl,
    logo: `${baseUrl}${BRAND_LOGO_SRC}`,
    description: 'Book tours worldwide. Find and reserve tours with free cancellation.',
    sameAs: [],
  });
  document.head.appendChild(script);
}
