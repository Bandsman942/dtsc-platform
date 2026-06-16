"use client";

import { useEffect } from "react";

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "a,button,input,textarea,select,label,[role='button'],[role='menu'],[role='dialog'],[data-mobile-bottom-nav]"
    )
  );
}

export function PrivateMobileChromeController() {
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(max-width: 1023px)");
    let navHidden = false;

    function applyNavState() {
      root.dataset.privateMobileNav = navHidden ? "hidden" : "visible";
    }

    function getFirstPrivatePanel() {
      return document.querySelector<HTMLElement>(
        ".dtsc-private-main > .dtsc-panel:first-child, .dtsc-private-main > div > .dtsc-panel:first-child, .dtsc-private-main > div > section.dtsc-panel:first-child"
      );
    }

    function updateScrollState() {
      if (!media.matches) {
        root.dataset.privateScroll = "desktop";
        root.dataset.privateMobileNav = "visible";
        root.style.removeProperty("--dtsc-private-first-block-height");
        root.style.removeProperty("--dtsc-private-first-block-progress");
        root.style.removeProperty("--dtsc-private-first-block-max-height");
        root.style.removeProperty("--dtsc-private-first-block-opacity");
        root.style.removeProperty("--dtsc-private-first-block-blur");
        root.style.removeProperty("--dtsc-private-first-block-translate");
        return;
      }
      const currentScrollY = window.scrollY;
      const progress = Math.max(0, Math.min(1, (currentScrollY - 18) / 180));
      const firstPanel = getFirstPrivatePanel();
      const fullHeight = firstPanel?.scrollHeight || 0;
      const maxHeight = fullHeight > 0 ? Math.max(0, fullHeight * (1 - progress)) : 0;
      root.dataset.privateScroll = progress > 0.08 ? "collapsing" : "top";
      root.style.setProperty("--dtsc-private-first-block-height", `${fullHeight}px`);
      root.style.setProperty("--dtsc-private-first-block-progress", progress.toFixed(3));
      root.style.setProperty("--dtsc-private-first-block-max-height", `${maxHeight}px`);
      root.style.setProperty("--dtsc-private-first-block-opacity", String(Math.max(0, 1 - progress * 0.82)));
      root.style.setProperty("--dtsc-private-first-block-blur", `${progress * 10}px`);
      root.style.setProperty("--dtsc-private-first-block-translate", `${progress * -18}px`);
    }

    function toggleMobileNavigation(event: PointerEvent) {
      if (!media.matches || isInteractiveTarget(event.target)) {
        return;
      }
      navHidden = !navHidden;
      applyNavState();
    }

    applyNavState();
    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    document.addEventListener("pointerdown", toggleMobileNavigation, { passive: true });
    media.addEventListener("change", updateScrollState);
    return () => {
      window.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
      document.removeEventListener("pointerdown", toggleMobileNavigation);
      media.removeEventListener("change", updateScrollState);
      delete root.dataset.privateScroll;
      delete root.dataset.privateMobileNav;
      root.style.removeProperty("--dtsc-private-first-block-height");
      root.style.removeProperty("--dtsc-private-first-block-progress");
      root.style.removeProperty("--dtsc-private-first-block-max-height");
      root.style.removeProperty("--dtsc-private-first-block-opacity");
      root.style.removeProperty("--dtsc-private-first-block-blur");
      root.style.removeProperty("--dtsc-private-first-block-translate");
    };
  }, []);

  return null;
}
