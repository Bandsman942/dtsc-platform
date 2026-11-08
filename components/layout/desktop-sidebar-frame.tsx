"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type DesktopSidebarContextValue = {
  collapsed: boolean;
  toggle: () => void;
};

const DesktopSidebarContext = createContext<DesktopSidebarContextValue | null>(null);
const PREFIX = "dtsc:desktop-sidebar:v1";

export function DesktopSidebarFrame({
  children,
  userId,
  productKey,
  preferCollapsed = false,
  workspaceMode = "default",
}: {
  children: ReactNode;
  userId: string;
  productKey: string;
  preferCollapsed?: boolean;
  workspaceMode?: "default" | "conversation";
}) {
  const storageKey = useMemo(() => `${PREFIX}:${userId}:${productKey}`, [userId, productKey]);
  const [collapsed, setCollapsed] = useState(false);

  // The desktop preference is purely visual; neither the server nor RBAC depends on it.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      setCollapsed(stored === "collapsed" ? true : stored === "expanded" ? false : preferCollapsed);
    } catch {
      setCollapsed(preferCollapsed);
    }

    function syncAcrossTabs(event: StorageEvent) {
      if (event.key !== storageKey) return;
      setCollapsed(event.newValue === "collapsed" ? true : event.newValue === "expanded" ? false : preferCollapsed);
    }
    window.addEventListener("storage", syncAcrossTabs);
    return () => window.removeEventListener("storage", syncAcrossTabs);
  }, [preferCollapsed, storageKey]);

  function toggle() {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(storageKey, next ? "collapsed" : "expanded");
      } catch {
        // Private browsing and restricted storage must not break the menu.
      }
      return next;
    });
  }

  return (
    <DesktopSidebarContext.Provider value={{ collapsed, toggle }}>
      <div
        data-dtsc-desktop-shell
        data-sidebar-collapsed={collapsed ? "true" : "false"}
        data-workspace-mode={workspaceMode}
        className="dtsc-desktop-shell min-w-0"
      >
        {children}
      </div>
    </DesktopSidebarContext.Provider>
  );
}

export function DesktopSidebarToggle({ locale }: { locale?: string | null }) {
  const context = useContext(DesktopSidebarContext);
  if (!context) return null;
  const english = locale === "en";
  const label = context.collapsed
    ? english ? "Expand navigation" : "Développer le menu"
    : english ? "Collapse navigation" : "Réduire le menu";
  const Icon = context.collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      data-desktop-sidebar-toggle
      aria-controls="dtsc-desktop-sidebar"
      aria-expanded={!context.collapsed}
      aria-label={label}
      title={label}
      onClick={context.toggle}
      className="flex min-h-11 w-full min-w-0 shrink-0 items-center justify-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-2 py-2.5 text-sm font-bold text-dtsc-muted transition-colors hover:border-cyan-400/50 hover:bg-dtsc-soft hover:text-dtsc-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="dtsc-sidebar-optional-text truncate">{label}</span>
    </button>
  );
}
