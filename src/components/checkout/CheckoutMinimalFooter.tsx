/** Minimal checkout/confirm legal footer — aligned to the content column. */
export default function CheckoutMinimalFooter() {
  return (
    <footer className="mt-6 border-t border-black/[0.08] py-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span>© {new Date().getFullYear()} Traverion</span>
        <a
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          className="underline-offset-2 hover:text-ink hover:underline"
        >
          Privacy
        </a>
        <a
          href="/terms"
          target="_blank"
          rel="noreferrer"
          className="underline-offset-2 hover:text-ink hover:underline"
        >
          Terms
        </a>
      </div>
    </footer>
  );
}
