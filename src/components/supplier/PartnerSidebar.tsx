import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, PanelLeftClose, PanelLeft } from 'lucide-react';
import type {
  PartnerNavItem,
  PartnerNavSectionId,
  PartnerSidebarChild,
  PartnerSidebarEntry,
  PartnerSidebarGroup,
} from '../../lib/partnerNav';
import {
  isPartnerNavSoonItem,
  partnerSidebarDefaultChild,
  partnerSidebarGroupContaining,
  readPartnerNavOpenGroups,
  writePartnerNavOpenGroups,
} from '../../lib/partnerNav';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { prefetchPartnerSection } from '../../lib/partner-section-prefetch';

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
  disabled,
  badge,
}: {
  item: Pick<PartnerNavItem, 'label' | 'icon'> & { id: string };
  active: boolean;
  onClick?: () => void;
  collapsed?: boolean;
  nested?: boolean;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      onPointerEnter={() => {
        if (!disabled) prefetchPartnerSection(item.id);
      }}
      onFocus={() => {
        if (!disabled) prefetchPartnerSection(item.id);
      }}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      aria-disabled={disabled || undefined}
      title={
        collapsed
          ? item.label
          : disabled && badge
            ? `${item.label} · ${badge}`
            : item.label
      }
      className={[
        'partner-nav-item lux-flat group relative flex w-full items-center text-left',
        collapsed ? 'partner-nav-item--collapsed' : '',
        nested ? 'partner-nav-item--nested' : '',
        disabled ? 'partner-nav-item--disabled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {active && !collapsed && !disabled ? (
        <span className="partner-nav-item__indicator" aria-hidden />
      ) : null}
      <item.icon
        className={`partner-icon shrink-0 ${
          disabled
            ? 'text-slate-300'
            : active
              ? 'text-[color:var(--partner-nav-active-ink,#0b3d88)]'
              : 'text-slate-500 group-hover:text-[color:var(--partner-nav-active-ink,#0b3d88)]'
        }`}
        strokeWidth={active && !disabled ? 2.25 : 1.85}
        aria-hidden
      />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <>
          <span className="partner-nav-item__label">{item.label}</span>
          {badge ? (
            <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              {badge}
            </span>
          ) : null}
        </>
      )}
    </button>
  );
}

function GroupChildren({
  group,
  open,
  activeSection,
  onNavigate,
}: {
  group: PartnerSidebarGroup;
  open: boolean;
  activeSection: string;
  onNavigate: (id: PartnerNavSectionId) => void;
}) {
  return (
    <div
      id={`partner-nav-group-${group.id}`}
      role="group"
      aria-labelledby={`partner-nav-group-btn-${group.id}`}
      className={`partner-nav-group-panel ${open ? 'partner-nav-group-panel--open' : ''}`}
      {...(!open ? { inert: true } : {})}
    >
      <div className="partner-nav-group-panel__inner">
        <ul className="partner-nav-group-children list-none p-0">
          {group.children.map((child: PartnerSidebarChild) => {
            if (isPartnerNavSoonItem(child)) {
              return (
                <li key={child.id}>
                  <NavButton item={child} active={false} nested disabled badge="Soon" />
                </li>
              );
            }
            return (
              <li key={child.id}>
                <NavButton
                  item={child}
                  active={activeSection === child.id}
                  nested
                  onClick={() => onNavigate(child.id)}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * Desktop Partner sidebar — premium grouped IA from partnerNav.
 */
export default function PartnerSidebar({
  primary,
  footer,
  activeSection,
  businessLabel,
  onNavigate,
  onHome,
  showFinishSetup,
  onFinishSetup,
  collapsed,
  onToggleCollapsed,
}: PartnerSidebarProps) {
  // onCreate / canCreate remain on the props type for SupplierLayout compatibility;
  // Create listing is offered from Listings and Home instead of the sidebar.
  const containing = partnerSidebarGroupContaining(activeSection, primary);
  const [openGroupIds, setOpenGroupIds] = useState<string[]>(() => readPartnerNavOpenGroups(primary));

  // Keep the active route's group expanded (without collapsing others the user opened).
  useEffect(() => {
    if (!containing?.id) return;
    setOpenGroupIds((prev) => {
      if (prev.includes(containing.id)) return prev;
      const next = [...prev, containing.id];
      writePartnerNavOpenGroups(next);
      return next;
    });
  }, [containing?.id]);

  const toggleGroup = useCallback(
    (group: PartnerSidebarGroup) => {
      setOpenGroupIds((prev) => {
        const isOpen = prev.includes(group.id);
        const next = isOpen ? prev.filter((id) => id !== group.id) : [...prev, group.id];
        writePartnerNavOpenGroups(next);
        return next;
      });
    },
    []
  );

  return (
    <aside
      className={`partner-sidebar hidden md:flex shrink-0 flex-col border-r border-[color:var(--partner-border,#e4e7ec)] ${
        collapsed ? 'w-[60px]' : 'w-[248px]'
      }`}
      aria-label="Partner navigation"
    >
      <div className={`shrink-0 ${collapsed ? 'px-1.5 pt-3 pb-2' : 'px-3 pt-3 pb-2.5'}`}>
        <button
          type="button"
          onClick={onHome}
          className={`partner-nav-item lux-flat flex min-w-0 items-center ${
            collapsed ? 'partner-nav-item--collapsed' : ''
          }`}
          aria-label="Partner home"
        >
          <img src={BRAND_LOGO_SRC} alt="" className="h-5 w-5 shrink-0 object-contain" />
          {!collapsed ? (
            <span className="min-w-0 text-left">
              <span className="block font-sans text-[11px] font-bold tracking-[0.16em] text-[color:var(--partner-ink,#0c1118)]">
                TRAVERION
              </span>
              <span className="mt-px block text-[11px] font-semibold text-[color:var(--partner-ink-muted,#5a6472)]">
                Partner
              </span>
            </span>
          ) : null}
        </button>
        {!collapsed ? (
          <div className="mt-3.5 min-w-0 border-t border-[color:var(--partner-border,#e4e7ec)] px-1.5 pt-3.5">
            {businessLabel ? (
              <p className="partner-workspace-name truncate leading-snug">{businessLabel}</p>
            ) : null}
            <p className="partner-workspace-kicker">Workspace</p>
          </div>
        ) : null}
      </div>

      <nav
        className={`partner-sidebar__scroll partner-nav-list min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-3 ${
          collapsed ? 'px-1.5' : 'px-2.5'
        } ${collapsed ? 'pt-1' : 'pt-2'}`}
      >
        {primary.map((entry) => {
          // Create listing lives on Listings / Home — keep action slots inert if present.
          if (entry.kind === 'action') {
            return null;
          }

          if (entry.kind === 'section') {
            if (collapsed) return null;
            return (
              <p
                key={entry.id}
                className="partner-nav-section-label px-2.5 pb-1.5 pt-3.5 text-[10.5px] font-semibold uppercase tracking-[0.11em] first:pt-1"
              >
                {entry.label}
              </p>
            );
          }

          if (entry.kind === 'item') {
            return (
              <div key={entry.id}>
                <NavButton
                  item={entry}
                  active={activeSection === entry.id}
                  collapsed={collapsed}
                  onClick={() => onNavigate(entry.id)}
                />
              </div>
            );
          }

          const isOpen = collapsed ? false : openGroupIds.includes(entry.id);
          const groupActive = entry.children.some(
            (c) => !isPartnerNavSoonItem(c) && c.id === activeSection
          );
          const collapsedTarget = partnerSidebarDefaultChild(entry);

          if (collapsed) {
            return (
              <div key={entry.id}>
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
            <div key={entry.id} className="pt-0.5">
              <button
                type="button"
                onClick={() => toggleGroup(entry)}
                aria-expanded={isOpen}
                aria-controls={`partner-nav-group-${entry.id}`}
                id={`partner-nav-group-btn-${entry.id}`}
                className="partner-nav-item lux-flat group flex w-full items-center text-left"
              >
                <entry.icon
                  className={`partner-icon shrink-0 ${
                    groupActive
                      ? 'text-[color:var(--partner-nav-active-ink,#0b3d88)]'
                      : 'text-slate-500 group-hover:text-[color:var(--partner-nav-active-ink,#0b3d88)]'
                  }`}
                  strokeWidth={groupActive ? 2.25 : 1.85}
                  aria-hidden
                />
                <span className="partner-nav-item__label">{entry.label}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 motion-reduce:transition-none ${
                    isOpen ? 'rotate-0' : '-rotate-90'
                  }`}
                  aria-hidden
                />
              </button>
              <GroupChildren
                group={entry}
                open={isOpen}
                activeSection={activeSection}
                onNavigate={onNavigate}
              />
            </div>
          );
        })}

        {showFinishSetup && onFinishSetup ? (
          <div className="px-0.5 pt-3">
            <button
              type="button"
              onClick={onFinishSetup}
              className={`partner-nav-item lux-flat w-full rounded-lg border border-amber-200/80 bg-amber-50/80 text-[13px] font-semibold text-amber-950 hover:bg-amber-50 ${
                collapsed ? 'partner-nav-item--collapsed' : 'text-left'
              }`}
              title="Finish setup"
              aria-label="Finish setup"
            >
              {collapsed ? '!' : 'Finish setup'}
            </button>
          </div>
        ) : null}
      </nav>

      <div
        className={`partner-nav-list shrink-0 border-t border-slate-100 pt-2.5 pb-1 ${
          collapsed ? 'px-1.5' : 'px-2.5'
        }`}
      >
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
        <div className={`shrink-0 pb-3 pt-1 ${collapsed ? 'px-1.5' : 'px-2.5'}`}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="partner-nav-item lux-flat flex w-full items-center justify-center gap-2 text-[13px] font-semibold text-[color:var(--partner-ink-muted,#5a6472)]"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" aria-hidden />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" aria-hidden />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      ) : null}
    </aside>
  );
}
