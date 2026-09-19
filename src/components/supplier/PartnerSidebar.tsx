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
      className={`partner-nav-item lux-flat group relative flex w-full items-center gap-2.5 rounded-md text-left text-[13.5px] font-medium ${
        collapsed ? 'justify-center px-2 py-2' : 'px-2.5 py-[7px]'
      } ${
        active
          ? 'bg-finland/[0.07] text-finland'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      {active && !collapsed ? (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-finland" aria-hidden />
      ) : null}
      <item.icon
        className={`h-4 w-4 shrink-0 ${active ? 'text-finland' : 'text-slate-400 group-hover:text-slate-500'}`}
        strokeWidth={active ? 2 : 1.6}
        aria-hidden
      />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
    </button>
  );
}

/**
 * Desktop Partner sidebar — quiet luxury, GYG-style groups.
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
      className={`partner-sidebar hidden md:flex shrink-0 flex-col border-r border-slate-200/80 ${
        collapsed ? 'w-[64px]' : 'w-[220px]'
      }`}
      aria-label="Partner navigation"
    >
      <div
        className={`flex items-center gap-2 border-b border-slate-200/80 ${
          collapsed ? 'justify-center px-2 py-3.5' : 'px-3.5 py-3.5'
        }`}
      >
        <button type="button" onClick={onHome} className="lux-flat flex min-w-0 items-center gap-2" aria-label="Partner home">
          <img src={BRAND_LOGO_SRC} alt="" className="h-7 w-7 shrink-0 object-contain" />
          {!collapsed ? (
            <span className="font-sans text-[10px] font-semibold tracking-[0.18em] text-slate-800">TRAVERION</span>
          ) : null}
        </button>
      </div>

      {!collapsed && businessLabel ? (
        <div className="border-b border-slate-200/80 px-3.5 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">Business</p>
          <p className="mt-0.5 truncate text-[13px] font-medium text-slate-800">{businessLabel}</p>
        </div>
      ) : null}

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {groups.map((group) => (
          <div key={group.id}>
            {!collapsed ? (
              <p className="mb-1 px-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
                {group.label}
              </p>
            ) : (
              <div className="mb-1 mx-auto h-px w-5 bg-slate-200" aria-hidden />
            )}
            <ul className="space-y-px">
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
              className={`partner-nav-item lux-flat w-full rounded-md border border-amber-200/70 bg-amber-50/50 text-[12px] font-medium text-amber-900 hover:bg-amber-50 ${
                collapsed ? 'px-2 py-2' : 'px-2.5 py-2 text-left'
              }`}
              title="Finish setup"
            >
              {collapsed ? '!' : 'Finish setup'}
            </button>
          </div>
        ) : null}
      </nav>

      {onToggleCollapsed ? (
        <div className="border-t border-slate-200/80 p-2">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="partner-nav-item lux-flat w-full rounded-md px-2.5 py-1.5 text-[12px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          >
            {collapsed ? '»' : 'Collapse'}
          </button>
        </div>
      ) : null}
    </aside>
  );
}
