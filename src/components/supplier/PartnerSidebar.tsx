import { useEffect, useState } from 'react';
import { ChevronDown, PanelLeftClose, PanelLeft, Plus } from 'lucide-react';
import type {
  PartnerNavItem,
  PartnerNavSectionId,
  PartnerSidebarEntry,
  PartnerSidebarGroup,
} from '../../lib/partnerNav';
import {
  partnerSidebarDefaultChild,
  partnerSidebarGroupContaining,
} from '../../lib/partnerNav';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';

type PartnerSidebarProps = {
  primary: PartnerSidebarEntry[];
  footer: PartnerNavItem[];
  activeSection: string;
  businessLabel: string | null;
  onNavigate: (id: PartnerNavSectionId) => void;
  onHome: () => void;
  onCreate: () => void;
  /** Phase 1755: hide Create CTA for finance/viewer. */
  canCreate?: boolean;
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
  nested,
}: {
  item: PartnerNavItem;
  active: boolean;
  onClick: () => void;
  collapsed?: boolean;
  nested?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={`partner-nav-item lux-flat group relative flex w-full items-center gap-2.5 rounded-md text-left text-[13.5px] ${
        collapsed ? 'justify-center px-2 py-2' : nested ? 'pl-8 pr-2.5 py-[7px]' : 'px-2.5 py-[8px]'
      } ${
        active
          ? 'bg-white font-semibold text-slate-900 shadow-[0_0_0_1px_rgba(15,23,42,0.06)]'
          : 'font-medium text-slate-600 hover:bg-slate-900/[0.055] hover:text-slate-900'
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
 * Desktop Partner sidebar — data-driven IA from partnerNav.
 */
export default function PartnerSidebar({
  primary,
  footer,
  activeSection,
  businessLabel,
  onNavigate,
  onHome,
  onCreate,
  canCreate = true,
  showFinishSetup,
  onFinishSetup,
  collapsed,
  onToggleCollapsed,
}: PartnerSidebarProps) {
  const containing = partnerSidebarGroupContaining(activeSection, primary);
  const [openGroupId, setOpenGroupId] = useState<string | null>(containing?.id ?? null);

  useEffect(() => {
    setOpenGroupId(containing?.id ?? null);
  }, [containing?.id]);

  const toggleGroup = (group: PartnerSidebarGroup) => {
    const isOpen = openGroupId === group.id;
    if (isOpen) {
      setOpenGroupId(null);
      return;
    }
    setOpenGroupId(group.id);
    const childIds = group.children.map((c) => c.id);
    if (!childIds.includes(activeSection as PartnerNavSectionId)) {
      onNavigate(partnerSidebarDefaultChild(group));
    }
  };

  return (
    <aside
      className={`partner-sidebar hidden md:flex shrink-0 flex-col border-r border-slate-200/80 ${
        collapsed ? 'w-[64px]' : 'w-[232px]'
      }`}
      aria-label="Partner navigation"
    >
      <div className={`shrink-0 ${collapsed ? 'px-2 py-3.5' : 'px-3.5 pt-3.5 pb-3'}`}>
        <button
          type="button"
          onClick={onHome}
          className={`partner-nav-item lux-flat flex min-w-0 items-center rounded-md ${
            collapsed ? 'justify-center px-1 py-1' : 'gap-2.5 px-1 py-1 -mx-1'
          } hover:bg-slate-900/[0.04]`}
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
        {primary.map((entry) => {
          if (entry.kind === 'action') {
            if (collapsed) {
              return (
                <div key={entry.id} className="mb-3 flex justify-center pb-3 border-b border-slate-200/70">
                  <button
                    type="button"
                    onClick={onCreate}
                    className="partner-nav-item partner-nav-cta lux-flat flex min-h-11 w-11 items-center justify-center rounded-md bg-finland text-white hover:bg-finland-dark"
                    title={entry.label}
                    aria-label={entry.label}
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                  </button>
                </div>
              );
            }
            return (
              <div key={entry.id} className="mb-3 px-0.5 pb-3 border-b border-slate-200/70">
                <button
                  type="button"
                  onClick={onCreate}
                  className="partner-nav-item partner-nav-cta lux-flat flex w-full items-center justify-center gap-1.5 rounded-md bg-finland px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-finland-dark"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                  {entry.label}
                </button>
              </div>
            );
          }

          if (entry.kind === 'item') {
            return (
              <div key={entry.id} className="mb-2">
                <NavButton
                  item={entry}
                  active={activeSection === entry.id}
                  collapsed={collapsed}
                  onClick={() => onNavigate(entry.id)}
                />
              </div>
            );
          }

          const isOpen = collapsed ? false : openGroupId === entry.id;
          const groupActive = entry.children.some((c) => c.id === activeSection);
          const collapsedTarget = partnerSidebarDefaultChild(entry);

          if (collapsed) {
            return (
              <div key={entry.id} className="mb-2">
                <NavButton
                  item={{ id: collapsedTarget, label: entry.label, icon: entry.icon }}
                  active={groupActive}
                  collapsed
                  onClick={() => onNavigate(collapsedTarget)}
                />
              </div>
            );
          }

          return (
            <div key={entry.id} className="mb-2">
              <button
                type="button"
                onClick={() => toggleGroup(entry)}
                aria-expanded={isOpen}
                aria-controls={isOpen ? `partner-nav-group-${entry.id}` : undefined}
                id={`partner-nav-group-btn-${entry.id}`}
                className={`partner-nav-item lux-flat group flex w-full items-center gap-2.5 rounded-md px-2.5 py-[8px] text-left text-[13.5px] font-medium ${
                  groupActive
                    ? 'text-slate-900 hover:bg-slate-900/[0.04]'
                    : 'text-slate-600 hover:bg-slate-900/[0.055] hover:text-slate-900'
                }`}
              >
                <entry.icon
                  className={`h-4 w-4 shrink-0 ${groupActive ? 'text-finland' : 'text-slate-400 group-hover:text-slate-600'}`}
                  strokeWidth={groupActive ? 2.1 : 1.65}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate leading-snug">{entry.label}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform duration-150 ${
                    isOpen ? 'rotate-0' : '-rotate-90'
                  }`}
                  aria-hidden
                />
              </button>
              {isOpen ? (
                <ul
                  id={`partner-nav-group-${entry.id}`}
                  role="group"
                  aria-labelledby={`partner-nav-group-btn-${entry.id}`}
                  className="mt-1 mb-1.5 space-y-1"
                >
                  {entry.children.map((child) => (
                    <li key={child.id}>
                      <NavButton
                        item={child}
                        active={activeSection === child.id}
                        nested
                        onClick={() => onNavigate(child.id)}
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
              aria-label="Finish setup"
            >
              {collapsed ? '!' : 'Finish setup'}
            </button>
          </div>
        ) : null}
      </nav>

      <div className="shrink-0 border-t border-slate-200/80 px-2 pt-2.5 pb-1.5 space-y-1">
        {footer.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={activeSection === item.id}
            collapsed={collapsed}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </div>

      {onToggleCollapsed ? (
        <div className="shrink-0 p-2 pt-1">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="partner-nav-item lux-flat flex w-full items-center justify-center gap-2 rounded-md px-2 py-2 text-[12.5px] font-medium text-slate-500 hover:bg-slate-900/[0.055] hover:text-slate-800"
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
