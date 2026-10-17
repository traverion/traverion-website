const CHUNK_RELOAD_KEY = 'traverion-chunk-reload';

const STALE_CHUNK_RE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Expected a JavaScript-or-Wasm module script|Loading chunk [\w-]+ failed|Loading CSS chunk/i;

export function staleChunkMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  return typeof value === 'string' ? value : '';
}

export function isStaleChunkMessage(message: string): boolean {
  return STALE_CHUNK_RE.test(message);
}

/** One reload after a deploy. A second failure stays on the page instead of looping. */
export function staleChunkRecovery(alreadyReloaded: boolean, message: string): 'reload' | 'fallback' | 'ignore' {
  if (!isStaleChunkMessage(message)) return 'ignore';
  return alreadyReloaded ? 'fallback' : 'reload';
}

function showFallback() {
  const root = document.getElementById('root');
  if (!root || root.childElementCount > 0) return;
  root.replaceChildren();
  const wrap = document.createElement('div');
  wrap.setAttribute('role', 'alert');
  wrap.style.cssText = 'max-width:32rem;margin:4rem auto;padding:0 1rem;font-family:sans-serif;color:#18181b';
  const title = document.createElement('h1');
  title.textContent = 'This page did not finish loading';
  title.style.cssText = 'font-size:1.25rem;margin:0';
  const body = document.createElement('p');
  body.textContent = 'Traverion was updated. Reload to open the latest version of this page.';
  body.style.cssText = 'margin:0.75rem 0 0;line-height:1.5';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Retry';
  button.style.cssText = 'margin-top:1rem;background:#073b83;color:#fff;border:0;border-radius:0.5rem;padding:0.6rem 0.9rem;font-weight:600';
  button.addEventListener('click', () => {
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    } catch {
      /* ignore */
    }
    window.location.reload();
  });
  wrap.append(title, body, button);
  root.append(wrap);
}

export function installStaleChunkReload(): void {
  if (typeof window === 'undefined') return;

  const alreadyReloaded = () => {
    try {
      return sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1';
    } catch {
      return false;
    }
  };

  const recover = (message: string) => {
    const action = staleChunkRecovery(alreadyReloaded(), message);
    if (action === 'ignore') return;
    if (action === 'fallback') {
      showFallback();
      return;
    }
    try {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    } catch {
      window.location.reload();
      return;
    }
    window.location.reload();
  };

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    const preload = event as Event & { payload?: unknown };
    recover(staleChunkMessage(preload.payload) || 'Unable to preload CSS');
  });

  window.addEventListener('unhandledrejection', (event) => {
    const message = staleChunkMessage(event.reason);
    if (!isStaleChunkMessage(message)) return;
    event.preventDefault();
    recover(message);
  });

  window.addEventListener('load', () => {
    window.setTimeout(() => {
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        /* ignore */
      }
    }, 8000);
  });
}
