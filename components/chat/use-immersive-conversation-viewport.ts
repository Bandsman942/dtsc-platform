"use client";

import { useEffect } from "react";

const MOBILE_QUERY = "(max-width: 1023px)";

export function useImmersiveConversationViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const privateMain = document.querySelector<HTMLElement>(".dtsc-private-main");
    if (!privateMain) return;

    const media = window.matchMedia(MOBILE_QUERY);
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousMainStyle = privateMain.getAttribute("style");
    const previousImmersive = root.dataset.dtscConversationImmersive;
    const lastScrollTop = new WeakMap<Element, number>();
    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;

    function setChromeVisible(visible: boolean) {
      if (!media.matches) return;
      if (root.dataset.dtscMobileInput === "active") {
        root.dataset.privateMobileNav = "hidden";
        return;
      }
      root.dataset.privateMobileNav = visible ? "visible" : "hidden";
    }

    function syncViewport() {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        if (!media.matches) {
          root.style.overflow = previousRootOverflow;
          body.style.overflow = previousBodyOverflow;
          body.style.overscrollBehavior = previousBodyOverscroll;
          if (previousMainStyle === null) privateMain.removeAttribute("style");
          else privateMain.setAttribute("style", previousMainStyle);
          return;
        }

        root.dataset.dtscConversationImmersive = "active";
        root.style.overflow = "hidden";
        body.style.overflow = "hidden";
        body.style.overscrollBehavior = "none";

        const viewport = window.visualViewport;
        const viewportTop = viewport?.offsetTop || 0;
        const viewportLeft = viewport?.offsetLeft || 0;
        const viewportWidth = viewport?.width || window.innerWidth;
        const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
        const navHidden = root.dataset.privateMobileNav === "hidden";
        const topNav = document.querySelector<HTMLElement>("[data-mobile-top-nav]");
        const bottomNav = document.querySelector<HTMLElement>("[data-mobile-bottom-nav]");
        const topRect = topNav?.getBoundingClientRect();
        const bottomRect = bottomNav?.getBoundingClientRect();
        const contentTop = navHidden || !topRect ? viewportTop : Math.max(viewportTop, topRect.bottom);
        const contentBottom = navHidden || !bottomRect ? viewportBottom : Math.min(viewportBottom, bottomRect.top);
        const availableHeight = Math.max(1, contentBottom - contentTop);

        privateMain.style.position = "fixed";
        privateMain.style.left = `${viewportLeft}px`;
        privateMain.style.right = "auto";
        privateMain.style.top = `${contentTop}px`;
        privateMain.style.bottom = "auto";
        privateMain.style.width = `${viewportWidth}px`;
        privateMain.style.height = `${availableHeight}px`;
        privateMain.style.minHeight = "0";
        privateMain.style.overflow = "hidden";
        privateMain.style.padding = "0";
        privateMain.style.zIndex = "20";
        privateMain.style.transition = "top 220ms cubic-bezier(0.22,1,0.36,1), height 220ms cubic-bezier(0.22,1,0.36,1)";
      });
    }

    function onNestedScroll(event: Event) {
      if (!media.matches) return;
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("[data-collaboration-immersive-root]")) return;
      const element = target as HTMLElement;
      const overflowY = window.getComputedStyle(element).overflowY;
      if (overflowY !== "auto" && overflowY !== "scroll") return;
      const current = element.scrollTop;
      const previous = lastScrollTop.get(target) ?? current;
      lastScrollTop.set(target, current);
      const delta = current - previous;
      if (current <= 6) {
        setChromeVisible(true);
      } else if (delta > 5) {
        setChromeVisible(false);
      } else if (delta < -8) {
        setChromeVisible(true);
      }
    }

    const mutationObserver = new MutationObserver((records) => {
      if (records.some((record) => record.attributeName === "data-private-mobile-nav" || record.attributeName === "data-dtsc-mobile-input")) syncViewport();
    });
    mutationObserver.observe(root, { attributes: true, attributeFilter: ["data-private-mobile-nav", "data-dtsc-mobile-input"] });

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(syncViewport);
      const topNav = document.querySelector<HTMLElement>("[data-mobile-top-nav]");
      const bottomNav = document.querySelector<HTMLElement>("[data-mobile-bottom-nav]");
      if (topNav) resizeObserver.observe(topNav);
      if (bottomNav) resizeObserver.observe(bottomNav);
    }

    document.addEventListener("scroll", onNestedScroll, true);
    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    media.addEventListener("change", syncViewport);
    syncViewport();

    return () => {
      window.cancelAnimationFrame(frameId);
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      document.removeEventListener("scroll", onNestedScroll, true);
      window.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("scroll", syncViewport);
      media.removeEventListener("change", syncViewport);
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      if (previousMainStyle === null) privateMain.removeAttribute("style");
      else privateMain.setAttribute("style", previousMainStyle);
      if (previousImmersive === undefined) delete root.dataset.dtscConversationImmersive;
      else root.dataset.dtscConversationImmersive = previousImmersive;
    };
  }, []);
}
