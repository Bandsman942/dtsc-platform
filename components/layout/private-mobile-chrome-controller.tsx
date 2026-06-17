"use client";

import { useEffect } from "react";

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "a,button,input,textarea,select,label,[role='button'],[role='menu'],[role='dialog'],[data-mobile-top-nav],[data-mobile-bottom-nav]"
    )
  );
}

export function PrivateMobileChromeController() {
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(max-width: 1023px)");
    let navHidden = false;
    let ticking = false;
    let scrollEndTimer: number | undefined;
    let latestProgress = 0;

    function applyNavState() {
      root.dataset.privateMobileNav = navHidden ? "hidden" : "visible";
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
      root.dataset.privateScrollActive = "true";
      window.clearTimeout(scrollEndTimer);
      scrollEndTimer = window.setTimeout(() => {
        delete root.dataset.privateScrollActive;
        updateScrollState({ settled: latestProgress > 0.04 });
      }, 220);
    }

    function onScroll() {
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
      if (!media.matches || isInteractiveTarget(event.target)) {
        return;
      }
      navHidden = !navHidden;
      applyNavState();
    }

    function updateSettledScrollState() {
      updateScrollState({ settled: true });
    }

    applyNavState();
    updateScrollState({ settled: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateSettledScrollState);
    document.addEventListener("pointerdown", toggleMobileNavigation, { passive: true });
    media.addEventListener("change", updateSettledScrollState);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateSettledScrollState);
      document.removeEventListener("pointerdown", toggleMobileNavigation);
      media.removeEventListener("change", updateSettledScrollState);
      window.clearTimeout(scrollEndTimer);
      delete root.dataset.privateScroll;
      delete root.dataset.privateMobileNav;
      delete root.dataset.privateScrollActive;
      clearFirstBlockProperties();
    };
  }, []);

  return null;
}
