/** Set document title and meta description. Call from App or page components. */
export function setPageMeta(title: string, description?: string) {
  if (typeof document === 'undefined') return;
  document.title = title ? `${title} · Traverion` : 'Traverion – Tours & Activities Worldwide';
  const meta = document.querySelector('meta[name="description"]');
  if (meta && description) meta.setAttribute('content', description);
}

/** Inject JSON-LD for a list of tours (schema.org Product/Tour). */
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
  const baseUrl = window.location.origin;
  const items = listings.slice(0, 20).map((item) => ({
    '@type': 'Product',
    '@id': `${baseUrl}/#/tour/${item.id}`,
    name: item.name,
    description: item.description,
    image: item.image,
    url: item.url ?? `${baseUrl}/packages`,
  }));
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': items,
  });
}
