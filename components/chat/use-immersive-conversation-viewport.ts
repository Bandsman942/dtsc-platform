"use client";

import { useEffect } from "react";

const MOBILE_QUERY = "(max-width: 1023px)";
const NAV_HIDE_DISTANCE = 56;
const NAV_SHOW_DISTANCE = 72;
const NAV_TOP_REVEAL_THRESHOLD = 12;
const SCROLL_DIRECTION_EPSILON = 2;

type ScrollDirection = "up" | "down" | null;
type ScrollState = {
  lastTop: number;
  anchorTop: number;
  direction: ScrollDirection;
};

export function useImmersiveConversationViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const privateMain = document.querySelector<HTMLElement>(".dtsc-private-main");
    if (!privateMain) return;
    const privateMainElement = privateMain;

    const media = window.matchMedia(MOBILE_QUERY);
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousMainStyle = privateMainElement.getAttribute("style");
    const previousImmersive = root.dataset.dtscConversationImmersive;
    const scrollStates = new WeakMap<HTMLElement, ScrollState>();
    let viewportFrameId = 0;
    let scrollFrameId = 0;
    let pendingScrollElement: HTMLElement | null = null;
    let lastViewportSignature = "";

    function restoreViewportStyles() {
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      if (previousMainStyle === null) privateMainElement.removeAttribute("style");
      else privateMainElement.setAttribute("style", previousMainStyle);
      if (previousImmersive === undefined) delete root.dataset.dtscConversationImmersive;
      else root.dataset.dtscConversationImmersive = previousImmersive;
      lastViewportSignature = "";
    }

    function setChromeVisible(visible: boolean) {
      if (!media.matches) return;
      const nextState = root.dataset.dtscMobileInput === "active" || !visible ? "hidden" : "visible";
      if (root.dataset.privateMobileNav === nextState) return;
      root.dataset.privateMobileNav = nextState;
    }

    function syncViewport() {
      window.cancelAnimationFrame(viewportFrameId);
      viewportFrameId = window.requestAnimationFrame(() => {
        if (!media.matches) {
          restoreViewportStyles();
          return;
        }

        if (root.dataset.dtscConversationImmersive !== "active") {
          root.dataset.dtscConversationImmersive = "active";
        }
        if (root.style.overflow !== "hidden") root.style.overflow = "hidden";
        if (body.style.overflow !== "hidden") body.style.overflow = "hidden";
        if (body.style.overscrollBehavior !== "none") body.style.overscrollBehavior = "none";

        const viewport = window.visualViewport;
        const viewportTop = Math.round((viewport?.offsetTop || 0) * 100) / 100;
        const viewportLeft = Math.round((viewport?.offsetLeft || 0) * 100) / 100;
        const viewportWidth = Math.round((viewport?.width || window.innerWidth) * 100) / 100;
        const viewportHeight = Math.round((viewport?.height || window.innerHeight) * 100) / 100;
        const signature = `${viewportTop}:${viewportLeft}:${viewportWidth}:${viewportHeight}`;
        if (signature === lastViewportSignature) return;
        lastViewportSignature = signature;

        // The conversation follows the actual VisualViewport directly. Mobile
        // navigation is an overlay and must never resize/reflow the message
        // viewport while a finger or inertial scroll is still moving.
        privateMainElement.style.position = "fixed";
        privateMainElement.style.left = `${viewportLeft}px`;
        privateMainElement.style.right = "auto";
        privateMainElement.style.top = `${viewportTop}px`;
        privateMainElement.style.bottom = "auto";
        privateMainElement.style.width = `${viewportWidth}px`;
        privateMainElement.style.height = `${viewportHeight}px`;
        privateMainElement.style.minHeight = "0";
        privateMainElement.style.overflow = "hidden";
        privateMainElement.style.padding = "0";
        privateMainElement.style.zIndex = "20";
        privateMainElement.style.transition = "none";
      });
    }

    function processNestedScroll() {
      scrollFrameId = 0;
      const element = pendingScrollElement;
      pendingScrollElement = null;
      if (!element || !media.matches) return;

      const current = element.scrollTop;
      const existing = scrollStates.get(element);
      if (!existing) {
        scrollStates.set(element, { lastTop: current, anchorTop: current, direction: null });
        if (current <= NAV_TOP_REVEAL_THRESHOLD) setChromeVisible(true);
        return;
      }

      const delta = current - existing.lastTop;
      existing.lastTop = current;

      if (current <= NAV_TOP_REVEAL_THRESHOLD) {
        existing.anchorTop = current;
        existing.direction = null;
        setChromeVisible(true);
        return;
      }

      if (Math.abs(delta) < SCROLL_DIRECTION_EPSILON) return;
      const direction: Exclude<ScrollDirection, null> = delta > 0 ? "down" : "up";
      if (existing.direction !== direction) {
        existing.direction = direction;
        existing.anchorTop = current;
        return;
      }

      const travelled = direction === "down" ? current - existing.anchorTop : existing.anchorTop - current;
      if (direction === "down" && travelled >= NAV_HIDE_DISTANCE) {
        setChromeVisible(false);
        existing.anchorTop = current;
      } else if (direction === "up" && travelled >= NAV_SHOW_DISTANCE) {
        setChromeVisible(true);
        existing.anchorTop = current;
      }
    }

    function onNestedScroll(event: Event) {
      if (!media.matches) return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches("[data-collaboration-scroll]")) return;
      pendingScrollElement = target;
      if (scrollFrameId) return;
      scrollFrameId = window.requestAnimationFrame(processNestedScroll);
    }

    document.addEventListener("scroll", onNestedScroll, true);
    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    media.addEventListener("change", syncViewport);
    syncViewport();

    return () => {
      window.cancelAnimationFrame(viewportFrameId);
      window.cancelAnimationFrame(scrollFrameId);
      document.removeEventListener("scroll", onNestedScroll, true);
      window.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("scroll", syncViewport);
      media.removeEventListener("change", syncViewport);
      restoreViewportStyles();
    };
  }, []);
}
