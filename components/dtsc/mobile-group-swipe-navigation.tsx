"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { canAccessAdministration } from "@/lib/admin-access";
import {
  MODULE_NAVIGATION_GROUPS,
  getModuleNavigationGroupHref,
  isModuleNavigationGroupCode,
  type ModuleNavigationGroupCode,
} from "@/lib/navigation/module-navigation-groups";
import { moduleNavigationGroupOwnsPath } from "@/lib/navigation/module-navigation-paths";

const EDGE_GUARD_PX = 28;
const SWIPE_THRESHOLD_PX = 72;
const MAX_GESTURE_MS = 900;
const HORIZONTAL_DOMINANCE = 1.2;
const DRAG_ACTIVATION_PX = 12;
const VELOCITY_COMMIT_PX_PER_MS = 0.48;
const MIN_VELOCITY_COMMIT_DISTANCE_PX = 42;
const TRANSITION_STORAGE_KEY = "dtsc:mobile-group-swipe-transition";
const MAIN_SELECTOR = ".dtsc-private-main";

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

type SwipeDirection = "left" | "right";

type StoredTransition = {
  direction: SwipeDirection;
  targetGroup: ModuleNavigationGroupCode;
  createdAt: number;
};

type SwipeGesture = {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startedAt: number;
  axis: "pending" | "horizontal";
  currentIndex: number;
  main: HTMLElement;
  prefetchedHref: string | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

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

function getMainContent() {
  return document.querySelector<HTMLElement>(MAIN_SELECTOR);
}

function resetMainPresentation(main: HTMLElement) {
  main.style.removeProperty("transform");
  main.style.removeProperty("opacity");
  main.style.removeProperty("will-change");
  main.style.removeProperty("box-shadow");
  main.style.removeProperty("transform-origin");
}

function animateBackToRest(main: HTMLElement) {
  if (prefersReducedMotion()) {
    resetMainPresentation(main);
    return;
  }

  const animation = main.animate(
    [
      {
        transform: main.style.transform || "translate3d(0, 0, 0) scale(1)",
        opacity: main.style.opacity || "1",
        boxShadow: main.style.boxShadow || "none",
      },
      { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1, boxShadow: "none" },
    ],
    {
      duration: 190,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    },
  );
  void animation.finished.finally(() => resetMainPresentation(main));
}

function settleGestureWithoutMotion(gesture: SwipeGesture) {
  resetMainPresentation(gesture.main);
}

function parseStoredTransition() {
  try {
    const raw = window.sessionStorage.getItem(TRANSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTransition>;
    if (
      (parsed.direction !== "left" && parsed.direction !== "right")
      || !parsed.targetGroup
      || !isModuleNavigationGroupCode(parsed.targetGroup)
      || typeof parsed.createdAt !== "number"
    ) {
      window.sessionStorage.removeItem(TRANSITION_STORAGE_KEY);
      return null;
    }
    return parsed as StoredTransition;
  } catch {
    window.sessionStorage.removeItem(TRANSITION_STORAGE_KEY);
    return null;
  }
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
    if (typeof window === "undefined" || window.innerWidth >= 1024) return;

    const canOpenInternalGroup = showInternalModules && (showEmployeeActivities || canAccessAdministration(role));
    const visibleGroups = MODULE_NAVIGATION_GROUPS.filter(
      (group) => group.code !== "DTSC_INTERNAL" || canOpenInternalGroup,
    );
    const queryGroup = isModuleNavigationGroupCode(selectedGroup) ? selectedGroup : null;
    const currentGroup = queryGroup || visibleGroups.find((group) => moduleNavigationGroupOwnsPath(group.code, pathname))?.code || null;
    if (!currentGroup) return;

    const stored = parseStoredTransition();
    if (!stored || stored.targetGroup !== currentGroup) return;
    window.sessionStorage.removeItem(TRANSITION_STORAGE_KEY);
    if (Date.now() - stored.createdAt > 2200) return;

    const main = getMainContent();
    if (!main) return;
    resetMainPresentation(main);
    if (prefersReducedMotion()) return;

    const offset = Math.min(window.innerWidth * 0.32, 190);
    const incomingX = stored.direction === "left" ? offset : -offset;
    main.style.willChange = "transform, opacity";
    main.style.transformOrigin = "center center";
    main.style.transform = `translate3d(${incomingX}px, 0, 0) scale(0.99)`;
    main.style.opacity = "0.86";

    const frame = window.requestAnimationFrame(() => {
      const animation = main.animate(
        [
          { transform: `translate3d(${incomingX}px, 0, 0) scale(0.99)`, opacity: 0.86 },
          { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
        ],
        {
          duration: 265,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
        },
      );
      void animation.finished.finally(() => resetMainPresentation(main));
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname, role, selectedGroup, showEmployeeActivities, showInternalModules]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const canOpenInternalGroup = showInternalModules && (showEmployeeActivities || canAccessAdministration(role));
    const visibleGroups = MODULE_NAVIGATION_GROUPS.filter(
      (group) => group.code !== "DTSC_INTERNAL" || canOpenInternalGroup,
    );
    const queryGroup = isModuleNavigationGroupCode(selectedGroup) ? selectedGroup : null;
    const currentGroup = queryGroup || visibleGroups.find((group) => moduleNavigationGroupOwnsPath(group.code, pathname))?.code || null;
    if (!currentGroup) return;

    const currentIndex = visibleGroups.findIndex((group) => group.code === currentGroup);
    if (currentIndex < 0) return;

    let gesture: SwipeGesture | null = null;
    let navigating = false;

    function onTouchStart(event: TouchEvent) {
      gesture = null;
      if (navigating || window.innerWidth >= 1024 || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (touch.clientX <= EDGE_GUARD_PX || touch.clientX >= window.innerWidth - EDGE_GUARD_PX) return;
      if (gestureIsBlocked(event.target)) return;
      const main = getMainContent();
      if (!main) return;
      main.getAnimations().forEach((animation) => animation.cancel());
      resetMainPresentation(main);
      gesture = {
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        startedAt: performance.now(),
        axis: "pending",
        currentIndex,
        main,
        prefetchedHref: null,
      };
    }

    function onTouchMove(event: TouchEvent) {
      if (!gesture || event.touches.length !== 1 || navigating) return;
      const touch = event.touches[0];
      const dx = touch.clientX - gesture.startX;
      const dy = touch.clientY - gesture.startY;
      gesture.lastX = touch.clientX;
      gesture.lastY = touch.clientY;

      if (performance.now() - gesture.startedAt > MAX_GESTURE_MS) {
        const activeGesture = gesture;
        gesture = null;
        if (activeGesture.axis === "horizontal") animateBackToRest(activeGesture.main);
        else settleGestureWithoutMotion(activeGesture);
        return;
      }

      if (gesture.axis === "pending") {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_ACTIVATION_PX) return;
        if (Math.abs(dy) > Math.abs(dx) * HORIZONTAL_DOMINANCE) {
          const activeGesture = gesture;
          gesture = null;
          settleGestureWithoutMotion(activeGesture);
          return;
        }
        if (Math.abs(dx) <= Math.abs(dy) * HORIZONTAL_DOMINANCE) return;
        gesture.axis = "horizontal";
      }

      const targetIndex = dx < 0 ? gesture.currentIndex + 1 : gesture.currentIndex - 1;
      const target = visibleGroups[targetIndex];
      const maxDrag = Math.min(window.innerWidth * 0.58, 330);
      const displayedDx = target ? clamp(dx, -maxDrag, maxDrag) : clamp(dx * 0.18, -48, 48);
      const progress = Math.min(1, Math.abs(displayedDx) / Math.max(1, window.innerWidth * 0.42));
      const scale = 1 - progress * 0.012;
      const opacity = 1 - progress * 0.045;

      gesture.main.style.willChange = "transform, opacity";
      gesture.main.style.transformOrigin = "center center";
      gesture.main.style.transform = `translate3d(${displayedDx}px, 0, 0) scale(${scale})`;
      gesture.main.style.opacity = String(opacity);
      gesture.main.style.boxShadow = displayedDx < 0
        ? "18px 0 36px -28px rgba(0, 23, 54, 0.38)"
        : "-18px 0 36px -28px rgba(0, 23, 54, 0.38)";

      if (target) {
        const href = getModuleNavigationGroupHref(target.code);
        if (gesture.prefetchedHref !== href) {
          gesture.prefetchedHref = href;
          router.prefetch(href);
        }
      }
    }

    function onTouchEnd(event: TouchEvent) {
      if (!gesture || event.changedTouches.length !== 1 || navigating) {
        gesture = null;
        return;
      }

      const activeGesture = gesture;
      gesture = null;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - activeGesture.startX;
      const dy = touch.clientY - activeGesture.startY;
      const elapsed = Math.max(1, performance.now() - activeGesture.startedAt);
      const velocity = Math.abs(dx) / elapsed;

      if (activeGesture.axis !== "horizontal") {
        settleGestureWithoutMotion(activeGesture);
        return;
      }
      if (Math.abs(dx) <= Math.abs(dy) * HORIZONTAL_DOMINANCE) {
        animateBackToRest(activeGesture.main);
        return;
      }

      const targetIndex = dx < 0 ? activeGesture.currentIndex + 1 : activeGesture.currentIndex - 1;
      const target = visibleGroups[targetIndex];
      if (!target) {
        animateBackToRest(activeGesture.main);
        return;
      }

      const distanceCommit = Math.abs(dx) >= SWIPE_THRESHOLD_PX;
      const velocityCommit = velocity >= VELOCITY_COMMIT_PX_PER_MS && Math.abs(dx) >= MIN_VELOCITY_COMMIT_DISTANCE_PX;
      if (!distanceCommit && !velocityCommit) {
        animateBackToRest(activeGesture.main);
        return;
      }

      navigating = true;
      const direction: SwipeDirection = dx < 0 ? "left" : "right";
      const targetHref = getModuleNavigationGroupHref(target.code);
      window.sessionStorage.setItem(TRANSITION_STORAGE_KEY, JSON.stringify({
        direction,
        targetGroup: target.code,
        createdAt: Date.now(),
      } satisfies StoredTransition));

      if (prefersReducedMotion()) {
        resetMainPresentation(activeGesture.main);
        router.push(targetHref);
        return;
      }

      const currentTransform = activeGesture.main.style.transform || `translate3d(${dx}px, 0, 0) scale(1)`;
      const currentOpacity = activeGesture.main.style.opacity || "1";
      const exitDistance = Math.max(Math.abs(dx), Math.min(window.innerWidth * 0.42, 280));
      const exitX = direction === "left" ? -exitDistance : exitDistance;
      const animation = activeGesture.main.animate(
        [
          { transform: currentTransform, opacity: currentOpacity },
          { transform: `translate3d(${exitX}px, 0, 0) scale(0.985)`, opacity: 0.82 },
        ],
        {
          duration: 145,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          fill: "forwards",
        },
      );

      void animation.finished
        .catch(() => undefined)
        .finally(() => router.push(targetHref));
    }

    function onTouchCancel() {
      if (gesture) {
        if (gesture.axis === "horizontal") animateBackToRest(gesture.main);
        else settleGestureWithoutMotion(gesture);
      }
      gesture = null;
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      if (gesture) resetMainPresentation(gesture.main);
      gesture = null;
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [pathname, role, router, selectedGroup, showEmployeeActivities, showInternalModules]);

  return <span className="sr-only" data-mobile-group-swipe="enabled" data-mobile-group-swipe-motion="fluid" />;
}
