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

    function applyNavState() {
      root.dataset.privateMobileNav = navHidden ? "hidden" : "visible";
    }

    function setFormControlActive(active: boolean) {
      formControlActive = active;
      if (active) {
        root.dataset.dtscMobileInput = "active";
        navHidden = true;
        applyNavState();
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
      if (nextScrollState === "top" && navHidden) {
        navHidden = false;
        applyNavState();
      }
      if (nextScrollState === "collapsed" && !navHidden) {
        navHidden = true;
        applyNavState();
      }
      root.style.setProperty("--dtsc-private-first-block-height", `${fullHeight}px`);
      root.style.setProperty("--dtsc-private-first-block-progress", progress.toFixed(3));
      root.style.setProperty("--dtsc-private-first-block-opacity", String(Math.max(0.16, 1 - progress * 0.72)));
      root.style.setProperty("--dtsc-private-first-block-blur", `${progress * 2.4}px`);
      root.style.setProperty("--dtsc-private-first-block-translate", `${progress * -10}px`);
    }

    function markScrollActive() {
      if (formControlActive) return;
      root.dataset.privateScrollActive = "true";
      window.clearTimeout(scrollEndTimer);
      scrollEndTimer = window.setTimeout(() => {
        delete root.dataset.privateScrollActive;
        updateScrollState({ settled: latestProgress > 0.04 });
      }, 220);
    }

    function onScroll() {
      if (formControlActive || isMobileFormControl(document.activeElement)) {
        return;
      }
      markScrollActive();
      if (ticking) {
        return;
      }
      ticking = true;
      window.requestAnimationFrame(() => {
        updateScrollState();
        ticking = false;
      });
    }

    function toggleMobileNavigation(event: PointerEvent) {
      if (!media.matches || formControlActive || isInteractiveTarget(event.target)) {
        return;
      }
      navHidden = !navHidden;
      applyNavState();
    }

    function updateSettledScrollState() {
      if (formControlActive || isMobileFormControl(document.activeElement)) {
        return;
      }
      updateScrollState({ settled: true });
    }

    function onFocusIn(event: FocusEvent) {
      if (!media.matches || !isMobileFormControl(event.target)) {
        return;
      }
      window.clearTimeout(focusRestoreTimer);
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
    document.addEventListener("pointerdown", toggleMobileNavigation, { passive: true });
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    media.addEventListener("change", updateSettledScrollState);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateSettledScrollState);
      document.removeEventListener("pointerdown", toggleMobileNavigation);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      media.removeEventListener("change", updateSettledScrollState);
      window.clearTimeout(scrollEndTimer);
      window.clearTimeout(focusRestoreTimer);
      delete root.dataset.privateScroll;
      delete root.dataset.privateMobileNav;
      delete root.dataset.privateScrollActive;
      delete root.dataset.dtscMobileInput;
      clearFirstBlockProperties();
    };
  }, []);

  return null;
}
