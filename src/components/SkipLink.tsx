/** Keyboard-only: jump past chrome to the page landmark. */
export default function SkipLink({ href = '#main-content' }: { href?: string }) {
  return (
    <a
      href={href}
      className="tv-skip"
      onClick={(e) => {
        const id = href.startsWith('#') ? href.slice(1) : 'main-content';
        const target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        target.focus();
      }}
    >
      Skip to content
    </a>
  );
}
