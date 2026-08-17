"use client";

import { useEffect } from "react";

const MOBILE_QUERY = "(max-width: 1023px)";
const KEYBOARD_GAP_THRESHOLD_PX = 120;
const IOS_SETTLE_DELAYS_MS = [0, 80, 180, 320];

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}

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
    let viewportFrameId = 0;
    let lastViewportSignature = "";
    const settleTimeoutIds = new Set<number>();

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
        const layoutWidth = Math.max(window.innerWidth, root.clientWidth);
        const layoutHeight = Math.max(window.innerHeight, root.clientHeight);
        const visualWidth = viewport?.width || layoutWidth;
        const visualHeight = viewport?.height || layoutHeight;
        const activeElement = document.activeElement;
        const keyboardCanBeOpen = isEditableTarget(activeElement);
        const keyboardGap = layoutHeight - visualHeight;
        const keyboardOpen = keyboardCanBeOpen && keyboardGap > KEYBOARD_GAP_THRESHOLD_PX;

        // iOS Safari can retain a stale VisualViewport offset/height for a few
        // frames after the software keyboard is dismissed. When no editable
        // control owns focus, the layout viewport is authoritative; this avoids
        // the dark band left underneath immersive conversations.
        const viewportTop = Math.round((keyboardOpen ? viewport?.offsetTop || 0 : 0) * 100) / 100;
        const viewportLeft = Math.round((keyboardOpen ? viewport?.offsetLeft || 0 : 0) * 100) / 100;
        const viewportWidth = Math.round((keyboardOpen ? visualWidth : layoutWidth) * 100) / 100;
        const viewportHeight = Math.round((keyboardOpen ? visualHeight : layoutHeight) * 100) / 100;
        const signature = `${viewportTop}:${viewportLeft}:${viewportWidth}:${viewportHeight}:${keyboardOpen ? "keyboard" : "layout"}`;
        if (signature === lastViewportSignature) return;
        lastViewportSignature = signature;

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

    function scheduleSettledSync() {
      IOS_SETTLE_DELAYS_MS.forEach((delay) => {
        const timeoutId = window.setTimeout(() => {
          settleTimeoutIds.delete(timeoutId);
          syncViewport();
        }, delay);
        settleTimeoutIds.add(timeoutId);
      });
    }

    function handleFocusChange(event: FocusEvent) {
      if (isEditableTarget(event.target)) scheduleSettledSync();
    }

    function handlePageShow() {
      scheduleSettledSync();
    }

    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", scheduleSettledSync);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("focusin", handleFocusChange);
    document.addEventListener("focusout", handleFocusChange);
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    media.addEventListener("change", syncViewport);
    scheduleSettledSync();

    return () => {
      window.cancelAnimationFrame(viewportFrameId);
      settleTimeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      settleTimeoutIds.clear();
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("orientationchange", scheduleSettledSync);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("focusin", handleFocusChange);
      document.removeEventListener("focusout", handleFocusChange);
      window.visualViewport?.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("scroll", syncViewport);
      media.removeEventListener("change", syncViewport);
      restoreViewportStyles();
    };
  }, []);
}
