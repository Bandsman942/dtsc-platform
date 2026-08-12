"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { canAccessAdministration } from "@/lib/admin-access";
import {
  MODULE_NAVIGATION_GROUPS,
  getModuleNavigationGroupHref,
  isModuleNavigationGroupCode,
} from "@/lib/navigation/module-navigation-groups";
import { moduleNavigationGroupOwnsPath } from "@/lib/navigation/module-navigation-paths";

const EDGE_GUARD_PX = 28;
const SWIPE_THRESHOLD_PX = 72;
const MAX_GESTURE_MS = 900;
const HORIZONTAL_DOMINANCE = 1.25;

const INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "label",
  "summary",
  "details",
  "[contenteditable='true']",
  "[role='button']",
  "[role='link']",
  "[role='dialog']",
  "[role='textbox']",
  "[role='combobox']",
  "[data-horizontal-rail]",
  "[data-professional-tabs]",
  "[data-mobile-secondary-nav]",
  "[data-dtsc-dialog-scroll]",
  "[data-workspace-context-switcher]",
  "[data-no-group-swipe]",
].join(",");

function hasHorizontalScrollContainer(element: Element | null) {
  let current: Element | null = element;
  while (current && current !== document.documentElement) {
    if (current.scrollWidth > current.clientWidth + 2) {
      const style = window.getComputedStyle(current);
      if (["auto", "scroll"].includes(style.overflowX)) return true;
    }
    current = current.parentElement;
  }
  return false;
}

function gestureIsBlocked(target: EventTarget | null) {
  const element = target instanceof Element ? target : null;
  if (!element) return true;
  return Boolean(element.closest(INTERACTIVE_SELECTOR)) || hasHorizontalScrollContainer(element);
}

export function MobileGroupSwipeNavigation({
  role,
  showInternalModules = false,
  showEmployeeActivities = false,
}: {
  role: UserRole;
  showInternalModules?: boolean;
  showEmployeeActivities?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedGroup = searchParams.get("group");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const canOpenInternalGroup = showInternalModules && (showEmployeeActivities || canAccessAdministration(role));
    const visibleGroups = MODULE_NAVIGATION_GROUPS.filter(
      (group) => group.code !== "DTSC_INTERNAL" || canOpenInternalGroup,
    );
    const queryGroup = isModuleNavigationGroupCode(selectedGroup) ? selectedGroup : null;
    const currentGroup = queryGroup || visibleGroups.find((group) => moduleNavigationGroupOwnsPath(group.code, pathname))?.code || null;
    if (!currentGroup) return;

    let gesture: { x: number; y: number; startedAt: number } | null = null;

    function onTouchStart(event: TouchEvent) {
      gesture = null;
      if (window.innerWidth >= 1024 || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (touch.clientX <= EDGE_GUARD_PX || touch.clientX >= window.innerWidth - EDGE_GUARD_PX) return;
      if (gestureIsBlocked(event.target)) return;
      gesture = { x: touch.clientX, y: touch.clientY, startedAt: Date.now() };
    }

    function onTouchEnd(event: TouchEvent) {
      if (!gesture || event.changedTouches.length !== 1) {
        gesture = null;
        return;
      }
      const touch = event.changedTouches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      const elapsed = Date.now() - gesture.startedAt;
      gesture = null;

      if (elapsed > MAX_GESTURE_MS) return;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
      if (Math.abs(dx) <= Math.abs(dy) * HORIZONTAL_DOMINANCE) return;

      const currentIndex = visibleGroups.findIndex((group) => group.code === currentGroup);
      if (currentIndex < 0) return;
      const targetIndex = dx < 0 ? currentIndex + 1 : currentIndex - 1;
      const target = visibleGroups[targetIndex];
      if (!target) return;
      router.push(getModuleNavigationGroupHref(target.code));
    }

    function onTouchCancel() {
      gesture = null;
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [pathname, role, router, selectedGroup, showEmployeeActivities, showInternalModules]);

  return <span className="sr-only" data-mobile-group-swipe="enabled" />;
}
