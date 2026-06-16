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
    let lastScrollY = window.scrollY;
    let navHidden = false;

    function applyNavState() {
      root.dataset.privateMobileNav = navHidden ? "hidden" : "visible";
    }

    function updateScrollState() {
      if (!media.matches) {
        root.dataset.privateScroll = "desktop";
        root.dataset.privateMobileNav = "visible";
        return;
      }
      const currentScrollY = window.scrollY;
      if (currentScrollY <= 24) {
        root.dataset.privateScroll = "top";
      } else if (currentScrollY > lastScrollY + 10) {
        root.dataset.privateScroll = "down";
      } else if (currentScrollY < lastScrollY - 10) {
        root.dataset.privateScroll = "up";
      }
      lastScrollY = Math.max(currentScrollY, 0);
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
    document.addEventListener("pointerdown", toggleMobileNavigation, { passive: true });
    media.addEventListener("change", updateScrollState);
    return () => {
      window.removeEventListener("scroll", updateScrollState);
      document.removeEventListener("pointerdown", toggleMobileNavigation);
      media.removeEventListener("change", updateScrollState);
      delete root.dataset.privateScroll;
      delete root.dataset.privateMobileNav;
    };
  }, []);

  return null;
}
