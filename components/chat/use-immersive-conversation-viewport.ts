"use client";

import { useEffect } from "react";

const MOBILE_QUERY = "(max-width: 1023px)";

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
        const viewportTop = Math.round((viewport?.offsetTop || 0) * 100) / 100;
        const viewportLeft = Math.round((viewport?.offsetLeft || 0) * 100) / 100;
        const viewportWidth = Math.round((viewport?.width || window.innerWidth) * 100) / 100;
        const viewportHeight = Math.round((viewport?.height || window.innerHeight) * 100) / 100;
        const signature = `${viewportTop}:${viewportLeft}:${viewportWidth}:${viewportHeight}`;
        if (signature === lastViewportSignature) return;
        lastViewportSignature = signature;

        // The message surface follows VisualViewport only. It never measures the
        // animated navigation and never reacts to message-list scroll events.
        // The global chrome controller owns tap-vs-drag navigation visibility.
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

    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    media.addEventListener("change", syncViewport);
    syncViewport();

    return () => {
      window.cancelAnimationFrame(viewportFrameId);
      window.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("scroll", syncViewport);
      media.removeEventListener("change", syncViewport);
      restoreViewportStyles();
    };
  }, []);
}
