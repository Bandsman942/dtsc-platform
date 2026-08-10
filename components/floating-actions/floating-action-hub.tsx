"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MoreVertical, X, type LucideIcon } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { getCurrentHostType, type HostType } from "@/lib/domains";
import { cn } from "@/lib/utils";

export type FloatingActionDefinition = {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  order?: number;
  mobileOnly?: boolean;
};

type FloatingActionRegistry = {
  register: (action: FloatingActionDefinition) => () => void;
};

const FloatingActionContext = createContext<FloatingActionRegistry | null>(null);
const SCROLL_DIRECTION_THRESHOLD = 8;

function isFloatingActionHostEnabled(hostType: HostType | null) {
  return hostType === "app" || hostType === "console" || hostType === "support" || hostType === "local";
}

function getScrollPosition(target: EventTarget | null) {
  if (target === document || target === document.documentElement || target === document.body) {
    return window.scrollY;
  }
  return target instanceof HTMLElement ? target.scrollTop : null;
}

function isRelevantWorkspaceScroll(target: EventTarget | null) {
  if (target === document || target === document.documentElement || target === document.body) {
    return Boolean(document.querySelector("[data-module-workspace], main"));
  }
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("[data-dtsc-dialog-panel], [data-floating-action-hub]")) return false;
  return Boolean(
    target.matches("main, [data-module-workspace], [data-module-content]") ||
      target.closest("[data-module-workspace], main") ||
      target.querySelector("[data-module-workspace]"),
  );
}

export function FloatingActionHubProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<Record<string, FloatingActionDefinition>>({});
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const [hostType, setHostType] = useState<HostType | null>(null);
  const scrollPositionsRef = useRef(new WeakMap<EventTarget, number>());
  const locale = useAppLocale() || "fr";

  const register = useCallback((action: FloatingActionDefinition) => {
    setActions((current) => ({ ...current, [action.id]: action }));
    return () => {
      setActions((current) => {
        if (!current[action.id]) return current;
        const next = { ...current };
        delete next[action.id];
        return next;
      });
    };
  }, []);

  // The context value must remain referentially stable. An inline object here
  // makes every registered action unsubscribe and subscribe again after each
  // state update, which creates a render loop and can freeze the application.
  const registry = useMemo<FloatingActionRegistry>(() => ({ register }), [register]);

  const sortedActions = useMemo(
    () => Object.values(actions).sort((left, right) => (left.order || 100) - (right.order || 100) || left.label.localeCompare(right.label)),
    [actions],
  );

  useEffect(() => {
    setHostType(getCurrentHostType(window.location.host));
  }, []);

  useEffect(() => {
    if (!sortedActions.length || !isFloatingActionHostEnabled(hostType)) setOpen(false);
    setVisible(true);
  }, [hostType, sortedActions.length]);

  useEffect(() => {
    if (!isFloatingActionHostEnabled(hostType)) return;

    function handleScroll(event: Event) {
      const target = event.target;
      if (!isRelevantWorkspaceScroll(target)) return;
      const position = getScrollPosition(target);
      if (position === null) return;
      const previous = scrollPositionsRef.current.get(target) ?? position;
      scrollPositionsRef.current.set(target, position);
      const delta = position - previous;
      if (Math.abs(delta) < SCROLL_DIRECTION_THRESHOLD) return;

      // Product contract #204: moving toward the top hides the hub;
      // moving toward the bottom brings it back. The initial state stays visible.
      if (delta < 0) {
        setOpen(false);
        setVisible(false);
      } else {
        setVisible(true);
      }
    }

    document.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", handleScroll, true);
  }, [hostType]);

  const hubEnabled = isFloatingActionHostEnabled(hostType);

  return (
    <FloatingActionContext.Provider value={registry}>
      {children}
      {hubEnabled && sortedActions.length ? (
        <div
          className={cn(
            "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-[950] flex max-h-[min(72dvh,38rem)] flex-col items-end gap-2 transition duration-200 sm:right-6",
            visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0",
          )}
          data-floating-action-hub
          data-floating-action-hub-visible={visible ? "true" : "false"}
          data-product-host={hostType}
        >
          {open ? (
            <div className="flex max-h-[calc(72dvh-4rem)] flex-col items-end gap-2 overflow-y-auto overscroll-contain pb-1 pr-1" role="menu" aria-label={locale === "en" ? "Quick actions" : "Actions rapides"}>
              {sortedActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      action.onSelect();
                    }}
                    className={cn(
                      "group inline-flex min-h-12 max-w-[min(22rem,calc(100vw-2rem))] items-center gap-3 rounded-2xl border border-cyan-300/45 bg-[#001736]/96 px-3 py-2 text-left text-white shadow-[0_14px_38px_rgba(0,23,54,0.3)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-[#002b5b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
                      action.mobileOnly && "lg:hidden",
                    )}
                  >
                    <span className="min-w-0 flex-1 break-words text-sm font-black leading-5">{action.label}</span>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-cyan-200">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-label={open ? (locale === "en" ? "Close quick actions" : "Fermer les actions rapides") : (locale === "en" ? "Open quick actions" : "Ouvrir les actions rapides")}
            className="grid h-14 w-14 place-items-center rounded-full border border-cyan-300/55 bg-[#002b5b] text-white shadow-[0_18px_45px_rgba(0,43,91,0.35)] transition hover:-translate-y-0.5 hover:bg-[#001736] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/45"
          >
            {open ? <X className="h-6 w-6" aria-hidden="true" /> : <MoreVertical className="h-6 w-6" aria-hidden="true" />}
          </button>
        </div>
      ) : null}
    </FloatingActionContext.Provider>
  );
}

export function useFloatingAction(action: FloatingActionDefinition | null) {
  const registry = useContext(FloatingActionContext);
  const actionRef = useRef(action);
  actionRef.current = action;
  const id = action?.id;
  const label = action?.label;
  const icon = action?.icon;
  const order = action?.order;
  const mobileOnly = action?.mobileOnly;

  useEffect(() => {
    if (!registry || !id || !label || !icon) return;
    return registry.register({ id, label, icon, order, mobileOnly, onSelect: () => actionRef.current?.onSelect() });
  }, [icon, id, label, mobileOnly, order, registry]);
}
