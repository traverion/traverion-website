import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, PanelLeftClose, PanelLeft, Plus } from 'lucide-react';
import type { PartnerNavGroup, PartnerNavItem, PartnerNavSectionId } from '../../lib/partnerNav';
import { PARTNER_NAV_TODAY } from '../../lib/partnerNav';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';

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
      className={`partner-nav-item lux-flat group relative flex w-full items-center gap-2.5 rounded-md text-left text-[13.5px] ${
        collapsed ? 'justify-center px-2 py-2' : 'px-2.5 py-[7px]'
      } ${
        active
          ? 'bg-white font-semibold text-slate-900 shadow-[0_0_0_1px_rgba(15,23,42,0.06)]'
          : 'font-medium text-slate-600 hover:bg-slate-900/[0.035] hover:text-slate-900'
      }`}
    >
      {active && !collapsed ? (
        <span
          className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-finland"
          aria-hidden
        />
      ) : null}
      <item.icon
        className={`h-4 w-4 shrink-0 ${
          active ? 'text-finland' : 'text-slate-400 group-hover:text-slate-600'
        }`}
        strokeWidth={active ? 2.1 : 1.65}
        aria-hidden
      />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="min-w-0 flex-1 truncate leading-snug">{item.label}</span>
      )}
    </button>
  );
}

/**
 * Desktop Partner sidebar — fixed in the app shell; only the main pane scrolls.
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
  const initialOpen = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const g of groups) {
      const containsActive = g.items.some((i) => i.id === activeSection);
      map[g.id] = containsActive || g.defaultOpen !== false;
      if (g.collapsible === false) map[g.id] = true;
    }
    return map;
  }, [groups, activeSection]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialOpen);

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        if (g.items.some((i) => i.id === activeSection)) next[g.id] = true;
      }
      return next;
    });
  }, [activeSection, groups]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const todayActive = activeSection === PARTNER_NAV_TODAY.id;

  return (
    <aside
      className={`partner-sidebar hidden md:flex shrink-0 flex-col border-r border-slate-200/80 ${
        collapsed ? 'w-[64px]' : 'w-[232px]'
      }`}
      aria-label="Partner navigation"
    >
      <div
        className={`shrink-0 ${
          collapsed ? 'px-2 py-3.5' : 'px-3.5 pt-3.5 pb-3'
        }`}
      >
        <button
          type="button"
          onClick={onHome}
          className={`lux-flat flex min-w-0 items-center ${collapsed ? 'justify-center' : 'gap-2.5'}`}
          aria-label="Partner home"
        >
          <img src={BRAND_LOGO_SRC} alt="" className="h-7 w-7 shrink-0 object-contain" />
          {!collapsed ? (
            <span className="min-w-0">
              <span className="block font-sans text-[11px] font-semibold tracking-[0.16em] text-slate-900">
                TRAVERION
              </span>
              <span className="mt-0.5 block text-[11px] font-medium text-slate-500">Partner</span>
            </span>
          ) : null}
        </button>
        {!collapsed && businessLabel ? (
          <p className="mt-3 truncate text-[12px] font-medium leading-snug text-slate-500">{businessLabel}</p>
        ) : null}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-1">
        <div className="mb-1.5">
          <NavButton
            item={PARTNER_NAV_TODAY}
            active={todayActive}
            collapsed={collapsed}
            onClick={() => onNavigate(PARTNER_NAV_TODAY.id)}
          />
        </div>

        {!collapsed ? (
          <div className="mb-3 px-0.5">
            <button
              type="button"
              onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings?new=1`)}
              className="partner-nav-item lux-flat flex w-full items-center justify-center gap-1.5 rounded-md bg-finland px-3 py-2 text-[13px] font-semibold text-white hover:bg-finland-dark"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
              New listing
            </button>
          </div>
        ) : (
          <div className="mb-2 flex justify-center">
            <button
              type="button"
              onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings?new=1`)}
              className="partner-nav-item lux-flat flex h-8 w-8 items-center justify-center rounded-md bg-finland text-white hover:bg-finland-dark"
              title="New listing"
              aria-label="New listing"
            >
              <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            </button>
          </div>
        )}

        {groups.map((group) => {
          const isOpen = collapsed ? true : openGroups[group.id] !== false;
          return (
            <div key={group.id} className="pt-2">
              {!collapsed ? (
                <button
                  type="button"
                  onClick={() => (group.collapsible === false ? undefined : toggleGroup(group.id))}
                  className={`lux-flat mb-0.5 flex w-full items-center justify-between rounded-md px-2.5 py-1 text-left ${
                    group.collapsible === false ? 'cursor-default' : 'hover:bg-slate-900/[0.03]'
                  }`}
                  aria-expanded={isOpen}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {group.label}
                  </span>
                  {group.collapsible !== false ? (
                    <ChevronDown
                      className={`h-3 w-3 text-slate-300 transition-transform duration-150 ${
                        isOpen ? 'rotate-0' : '-rotate-90'
                      }`}
                      aria-hidden
                    />
                  ) : null}
                </button>
              ) : (
                <div className="mx-auto my-1.5 h-px w-5 bg-slate-200/90" aria-hidden />
              )}
              {isOpen ? (
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
              ) : null}
            </div>
          );
        })}

        {showFinishSetup && onFinishSetup ? (
          <div className="px-0.5 pt-3">
            <button
              type="button"
              onClick={onFinishSetup}
              className={`partner-nav-item lux-flat w-full rounded-md border border-amber-200/80 bg-amber-50/80 text-[12.5px] font-semibold text-amber-950 hover:bg-amber-50 ${
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
        <div className="shrink-0 border-t border-slate-200/80 p-2">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="partner-nav-item lux-flat flex w-full items-center justify-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] font-medium text-slate-500 hover:bg-slate-900/[0.035] hover:text-slate-800"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" aria-hidden />
            ) : (
              <>
                <PanelLeftClose className="h-3.5 w-3.5" aria-hidden />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      ) : null}
    </aside>
  );
}
