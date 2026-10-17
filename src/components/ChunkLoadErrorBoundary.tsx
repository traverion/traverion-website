import { Component, type ErrorInfo, type ReactNode } from 'react';

const CHUNK_LOAD_RE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|Loading CSS chunk|Unable to preload CSS|Expected a JavaScript-or-Wasm module script/i;

export function isChunkLoadError(error: unknown): boolean {
  if (error instanceof Error) return CHUNK_LOAD_RE.test(`${error.name} ${error.message}`);
  if (typeof error === 'string') return CHUNK_LOAD_RE.test(error);
  return false;
}

type Props = {
  children: ReactNode;
  resetKey?: string;
};

type State = { error: Error | null };

/**
 * Recoverable failure when a lazy route's hashed chunk is missing or stale.
 * Retry reloads the document once per click so the browser fetches the current HTML.
 * There is no automatic reload.
 */
export class ChunkLoadErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error)) {
      console.error('Traverion could not load this page.', error.message);
      return;
    }
    console.error(error, info.componentStack);
  }

  private retry = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkLoadError(error);
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16 text-ink" role="alert">
        <h1 className="font-sans text-xl font-bold tracking-tight sm:text-2xl">
          {chunk ? 'This page did not finish loading' : 'This page could not be opened'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {chunk
            ? 'Traverion may have just been updated. Reload to open the latest version of this page.'
            : 'Reload the page. If it keeps happening, go back and try again.'}
        </p>
        <button type="button" className="tv-btn-primary mt-6" onClick={this.retry}>
          Retry
        </button>
      </div>
    );
  }
}
