/**
 * Lightweight Core Web Vitals sampling — no third-party RUM dependency.
 * Opt-in: `?perf=1` on any host, or `localStorage.traverion_perf = '1'`.
 * Never logs PII; route path only (no query).
 */

export type VitalName = 'LCP' | 'INP' | 'CLS' | 'TTFB' | 'FCP';

export type VitalSample = {
  name: VitalName;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  path: string;
  at: number;
};

const samples: VitalSample[] = [];

function pathOnly(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname || '/';
}

function rate(name: VitalName, value: number): VitalSample['rating'] {
  // Thresholds align with web.dev (75th-percentile targets).
  if (name === 'LCP') return value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor';
  if (name === 'INP') return value <= 200 ? 'good' : value <= 500 ? 'needs-improvement' : 'poor';
  if (name === 'CLS') return value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-improvement' : 'poor';
  if (name === 'FCP') return value <= 1800 ? 'good' : value <= 3000 ? 'needs-improvement' : 'poor';
  // TTFB
  return value <= 800 ? 'good' : value <= 1800 ? 'needs-improvement' : 'poor';
}

function push(name: VitalName, value: number) {
  const sample: VitalSample = {
    name,
    value: name === 'CLS' ? Number(value.toFixed(4)) : Math.round(value),
    rating: rate(name, value),
    path: pathOnly(),
    at: Date.now(),
  };
  samples.push(sample);
  if (samples.length > 40) samples.shift();
  if (typeof console !== 'undefined' && console.info) {
    console.info('[traverion-perf]', sample.name, sample.value, sample.rating, sample.path);
  }
}

export function getWebVitalSamples(): readonly VitalSample[] {
  return samples;
}

export function isWebVitalsReportingEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('perf') === '1') return true;
    if (window.localStorage?.getItem('traverion_perf') === '1') return true;
  } catch {
    /* private mode / blocked storage */
  }
  return false;
}

export function installWebVitalsLite(): void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;
  if (!isWebVitalsReportingEnabled()) return;

  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav) push('TTFB', nav.responseStart);
  } catch {
    /* ignore */
  }

  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') push('FCP', entry.startTime);
      }
    });
    po.observe({ type: 'paint', buffered: true });
  } catch {
    /* ignore */
  }

  try {
    const po = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
      if (last) push('LCP', last.startTime);
    });
    po.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    /* ignore */
  }

  try {
    let cls = 0;
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
        if (!entry.hadRecentInput) cls += entry.value ?? 0;
      }
      push('CLS', cls);
    });
    po.observe({ type: 'layout-shift', buffered: true });
  } catch {
    /* ignore */
  }

  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { duration: number; name: string }>) {
        // event timing: first-input / event → approximate INP with max duration
        if (entry.duration > 0) push('INP', entry.duration);
      }
    });
    po.observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  } catch {
    try {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          push('INP', entry.duration || (entry as PerformanceEntry & { processingStart?: number }).processingStart || 0);
        }
      });
      po.observe({ type: 'first-input', buffered: true });
    } catch {
      /* ignore */
    }
  }

  (window as Window & { __traverionPerf?: typeof getWebVitalSamples }).__traverionPerf = getWebVitalSamples;
}
