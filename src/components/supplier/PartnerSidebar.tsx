import type { PartnerNavGroup, PartnerNavItem, PartnerNavSectionId } from '../../lib/partnerNav';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';

type PartnerSidebarProps = {
  groups: PartnerNavGroup[];
  activeSection: string;
  businessLabel: string | null;
  onNavigate: (id: PartnerNavSectionId) => void;
  onHome: () => void;
  showFinishSetup?: boolean;
  onFinishSetup?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
};

function NavButton({
  item,
  active,
  onClick,
  collapsed,
}: {
  item: PartnerNavItem;
  active: boolean;
  onClick: () => void;
  collapsed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={`lux-flat group flex w-full items-center gap-3 rounded-lg text-left text-[13px] font-medium transition-colors duration-150 ${
        collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'
      } ${
        active
          ? 'bg-finland text-white shadow-sm'
          : 'text-ink-muted hover:bg-black/[0.04] hover:text-ink'
      }`}
    >
      <item.icon
        className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-white' : 'text-ink-faint group-hover:text-ink-muted'}`}
        strokeWidth={active ? 2.2 : 1.75}
        aria-hidden
      />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
    </button>
  );
}

/**
 * Desktop Partner sidebar — GYG-style explicit groups, Traverion identity.
 * Collapse mode keeps icons only for laptop width.
 */
export default function PartnerSidebar({
  groups,
  activeSection,
  businessLabel,
  onNavigate,
  onHome,
  showFinishSetup,
  onFinishSetup,
  collapsed,
  onToggleCollapsed,
}: PartnerSidebarProps) {
  return (
    <aside
      className={`partner-sidebar hidden md:flex shrink-0 flex-col border-r border-black/[0.06] bg-paper-raised ${
        collapsed ? 'w-[72px]' : 'w-[240px]'
      }`}
      aria-label="Partner navigation"
    >
      <div className={`flex items-center gap-2.5 border-b border-black/[0.06] ${collapsed ? 'justify-center px-2 py-4' : 'px-4 py-4'}`}>
        <button type="button" onClick={onHome} className="lux-flat flex min-w-0 items-center gap-2.5" aria-label="Partner home">
          <img src={BRAND_LOGO_SRC} alt="" className="h-8 w-8 shrink-0 object-contain" />
          {!collapsed ? (
            <span className="font-sans text-[11px] font-semibold tracking-[0.2em] text-ink">TRAVERION</span>
          ) : null}
        </button>
      </div>

      {!collapsed && businessLabel ? (
        <div className="border-b border-black/[0.06] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Business</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-ink">{businessLabel}</p>
        </div>
      ) : null}

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
        {groups.map((group) => (
          <div key={group.id}>
            {!collapsed ? (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                {group.label}
              </p>
            ) : (
              <div className="mb-1.5 mx-auto h-px w-6 bg-black/[0.08]" aria-hidden />
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.id}>
                  <NavButton
                    item={item}
                    active={activeSection === item.id}
                    collapsed={collapsed}
                    onClick={() => onNavigate(item.id)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}

        {showFinishSetup && onFinishSetup ? (
          <div className={collapsed ? 'px-1' : 'px-1 pt-1'}>
            <button
              type="button"
              onClick={onFinishSetup}
              className={`lux-flat w-full rounded-lg bg-amber-50 text-amber-950 ring-1 ring-amber-200/80 text-[12px] font-semibold hover:bg-amber-100/90 ${
                collapsed ? 'px-2 py-2.5' : 'px-3 py-2.5 text-left'
              }`}
              title="Finish setup"
            >
              {collapsed ? '!' : 'Finish setup'}
            </button>
          </div>
        ) : null}
      </nav>

      {onToggleCollapsed ? (
        <div className="border-t border-black/[0.06] p-2">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="lux-flat w-full rounded-lg px-3 py-2 text-[12px] font-medium text-ink-muted hover:bg-black/[0.04] hover:text-ink"
          >
            {collapsed ? '»' : 'Collapse'}
          </button>
        </div>
      ) : null}
    </aside>
  );
}
