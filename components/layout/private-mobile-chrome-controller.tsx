"use client";

import { useEffect } from "react";

const MOBILE_FORM_CONTROL_SELECTOR = [
  "input:not([type='button']):not([type='submit']):not([type='reset']):not([type='checkbox']):not([type='radio']):not([type='range']):not([type='file']):not([type='hidden'])",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='textbox']",
  "[role='combobox']",
].join(",");

const IMMERSIVE_ROOT_SELECTOR = "[data-collaboration-immersive-root]";
const IMMERSIVE_DRAG_THRESHOLD = 22;
const IMMERSIVE_TAP_THRESHOLD = 10;
const IMMERSIVE_TAP_MAX_MS = 360;

type ImmersivePointerGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  startedAt: number;
  decided: boolean;
  moved: boolean;
};

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "a,button,input,textarea,select,label,[contenteditable='true'],[role='button'],[role='menu'],[role='dialog'],[role='textbox'],[role='combobox'],[data-mobile-top-nav],[data-mobile-bottom-nav]"
    )
  );
}

function isMobileFormControl(target: EventTarget | null) {
  return target instanceof Element && target.matches(MOBILE_FORM_CONTROL_SELECTOR);
}

function isImmersiveConversationTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(IMMERSIVE_ROOT_SELECTOR));
}

export function PrivateMobileChromeController() {
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(max-width: 1023px)");
    let navHidden = false;
    let formControlActive = false;
    let ticking = false;
    let scrollEndTimer: number | undefined;
    let focusRestoreTimer: number | undefined;
    let latestProgress = 0;
    let immersiveGesture: ImmersivePointerGesture | null = null;

    function applyNavState() {
      const nextState = navHidden ? "hidden" : "visible";
      if (root.dataset.privateMobileNav !== nextState) {
        root.dataset.privateMobileNav = nextState;
      }
    }

    function setNavigationHidden(hidden: boolean) {
      if (navHidden === hidden) return;
      navHidden = hidden;
      applyNavState();
    }

    function setFormControlActive(active: boolean) {
      formControlActive = active;
      if (active) {
        root.dataset.dtscMobileInput = "active";
        setNavigationHidden(true);
        return;
      }
      delete root.dataset.dtscMobileInput;
    }

    function getFirstPrivatePanel() {
      return document.querySelector<HTMLElement>(
        ".dtsc-private-main > .dtsc-panel:first-child, .dtsc-private-main > div > .dtsc-panel:first-child, .dtsc-private-main > div > section.dtsc-panel:first-child"
      );
    }

    function clearFirstBlockProperties() {
      root.style.removeProperty("--dtsc-private-first-block-height");
      root.style.removeProperty("--dtsc-private-first-block-progress");
      root.style.removeProperty("--dtsc-private-first-block-opacity");
      root.style.removeProperty("--dtsc-private-first-block-blur");
      root.style.removeProperty("--dtsc-private-first-block-translate");
    }

    function updateScrollState({ settled = false } = {}) {
      if (!media.matches) {
        root.dataset.privateScroll = "desktop";
        root.dataset.privateMobileNav = "visible";
        navHidden = false;
        delete root.dataset.privateScrollActive;
        delete root.dataset.dtscMobileInput;
        formControlActive = false;
        clearFirstBlockProperties();
        return;
      }

      // WebKit emits window resize/scroll while showing or dismissing the
      // software keyboard. Those viewport events are not page-navigation input.
      if (formControlActive || isMobileFormControl(document.activeElement)) {
        setFormControlActive(true);
        return;
      }

      // Immersive conversations own no window/page scroll. Their chrome is
      // controlled exclusively by the pointer gesture below, so this legacy
      // page-scroll state must not fight the conversation during a drag.
      if (root.dataset.dtscConversationImmersive === "active") {
        root.dataset.privateScroll = "immersive";
        clearFirstBlockProperties();
        return;
      }

      const currentScrollY = window.scrollY;
      const progress = Math.max(0, Math.min(1, (currentScrollY - 18) / 180));
      latestProgress = progress;
      const firstPanel = getFirstPrivatePanel();
      const fullHeight = firstPanel?.scrollHeight || 0;
      const keepCollapsed = root.dataset.privateScroll === "collapsed" && progress > 0.16;
      let nextScrollState: "top" | "collapsing" | "collapsed";
      if (progress <= 0.04) {
        nextScrollState = "top";
      } else if (keepCollapsed || (settled && progress > 0.72)) {
        nextScrollState = "collapsed";
      } else {
        nextScrollState = "collapsing";
      }
      root.dataset.privateScroll = nextScrollState;
      if (nextScrollState === "top") setNavigationHidden(false);
      if (nextScrollState === "collapsed") setNavigationHidden(true);
      root.style.setProperty("--dtsc-private-first-block-height", `${fullHeight}px`);
      root.style.setProperty("--dtsc-private-first-block-progress", progress.toFixed(3));
      root.style.setProperty("--dtsc-private-first-block-opacity", String(Math.max(0.16, 1 - progress * 0.72)));
      root.style.setProperty("--dtsc-private-first-block-blur", `${progress * 2.4}px`);
      root.style.setProperty("--dtsc-private-first-block-translate", `${progress * -10}px`);
    }

    function markScrollActive() {
      if (formControlActive || root.dataset.dtscConversationImmersive === "active") return;
      root.dataset.privateScrollActive = "true";
      window.clearTimeout(scrollEndTimer);
      scrollEndTimer = window.setTimeout(() => {
        delete root.dataset.privateScrollActive;
        updateScrollState({ settled: latestProgress > 0.04 });
      }, 220);
    }

    function onScroll() {
      if (formControlActive || isMobileFormControl(document.activeElement) || root.dataset.dtscConversationImmersive === "active") {
        return;
      }
      markScrollActive();
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        updateScrollState();
        ticking = false;
      });
    }

    function onPointerDown(event: PointerEvent) {
      if (!media.matches || formControlActive || isInteractiveTarget(event.target)) return;

      if (isImmersiveConversationTarget(event.target)) {
        immersiveGesture = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startedAt: performance.now(),
          decided: false,
          moved: false,
        };
        return;
      }

      // Preserve the established behavior for every other private module.
      setNavigationHidden(!navHidden);
    }

    function onPointerMove(event: PointerEvent) {
      const gesture = immersiveGesture;
      if (!gesture || gesture.pointerId !== event.pointerId || gesture.decided || formControlActive) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const distance = Math.hypot(dx, dy);
      if (distance > IMMERSIVE_TAP_THRESHOLD) gesture.moved = true;
      if (Math.abs(dy) < IMMERSIVE_DRAG_THRESHOLD || Math.abs(dy) <= Math.abs(dx)) return;

      // Decide only once per finger gesture. Finger-up movement scrolls content
      // down and hides chrome; finger-down movement reveals it. Inertial bounce
      // cannot reverse this decision because no scroll listener owns nav state.
      gesture.decided = true;
      setNavigationHidden(dy < 0);
    }

    function finishImmersiveGesture(event: PointerEvent, allowTap: boolean) {
      const gesture = immersiveGesture;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      immersiveGesture = null;
      if (!allowTap || gesture.decided || gesture.moved || formControlActive) return;
      const elapsed = performance.now() - gesture.startedAt;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (elapsed <= IMMERSIVE_TAP_MAX_MS && Math.hypot(dx, dy) <= IMMERSIVE_TAP_THRESHOLD) {
        setNavigationHidden(!navHidden);
      }
    }

    function onPointerUp(event: PointerEvent) {
      finishImmersiveGesture(event, true);
    }

    function onPointerCancel(event: PointerEvent) {
      finishImmersiveGesture(event, false);
    }

    function updateSettledScrollState() {
      if (formControlActive || isMobileFormControl(document.activeElement)) return;
      updateScrollState({ settled: true });
    }

    function onFocusIn(event: FocusEvent) {
      if (!media.matches || !isMobileFormControl(event.target)) return;
      window.clearTimeout(focusRestoreTimer);
      immersiveGesture = null;
      setFormControlActive(true);
    }

    function onFocusOut() {
      window.clearTimeout(focusRestoreTimer);
      // Wait until WebKit finishes the keyboard/picker dismissal animation and
      // avoid flashing the nav when focus moves directly to the next control.
      focusRestoreTimer = window.setTimeout(() => {
        if (isMobileFormControl(document.activeElement)) {
          setFormControlActive(true);
          return;
        }
        setFormControlActive(false);
        updateScrollState({ settled: true });
      }, 420);
    }

    applyNavState();
    updateScrollState({ settled: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateSettledScrollState);
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerup", onPointerUp, { passive: true });
    document.addEventListener("pointercancel", onPointerCancel, { passive: true });
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    media.addEventListener("change", updateSettledScrollState);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateSettledScrollState);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      media.removeEventListener("change", updateSettledScrollState);
      window.clearTimeout(scrollEndTimer);
      window.clearTimeout(focusRestoreTimer);
      immersiveGesture = null;
      delete root.dataset.privateScroll;
      delete root.dataset.privateMobileNav;
      delete root.dataset.privateScrollActive;
      delete root.dataset.dtscMobileInput;
      clearFirstBlockProperties();
    };
  }, []);

  return null;
}
