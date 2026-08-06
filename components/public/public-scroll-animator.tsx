"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

const REVEAL_SELECTOR = [
  "main > section:not(:first-of-type) > div",
  "main > section:not(:first-of-type) article",
  "main > section:not(:first-of-type) .dtsc-premium-reveal",
  "main > section:not(:first-of-type) .dtsc-premium-reveal-delay",
  "main > section:not(:first-of-type) [data-dtsc-scroll-reveal]",
].join(",");

function selectRevealTargets() {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
  const unique = candidates.filter((node, index) => candidates.indexOf(node) === index);

  return unique.filter((node) => {
    if (node.closest('[role="dialog"]')) return false;
    if (node.hasAttribute("data-dtsc-no-scroll-reveal")) return false;
    if (node.classList.contains("dtsc-reveal")) return false;

    if (node.matches("main > section:not(:first-of-type) > div")) {
      return !node.querySelector("article, .dtsc-premium-reveal, .dtsc-premium-reveal-delay, [data-dtsc-scroll-reveal]");
    }

    return true;
  });
}

export function PublicScrollAnimator() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const targets = selectRevealTargets();
    if (!targets.length) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || typeof IntersectionObserver === "undefined") {
      targets.forEach((node) => node.setAttribute("data-dtsc-scroll-state", "visible"));
      return;
    }

    targets.forEach((node, index) => {
      node.setAttribute("data-dtsc-scroll-state", "pending");
      node.style.setProperty("--dtsc-scroll-delay", `${Math.min(index % 5, 4) * 55}ms`);
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const node = entry.target as HTMLElement;
          node.setAttribute("data-dtsc-scroll-state", "visible");
          observer.unobserve(node);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -7% 0px" },
    );

    targets.forEach((node) => observer.observe(node));

    return () => {
      observer.disconnect();
      targets.forEach((node) => {
        node.removeAttribute("data-dtsc-scroll-state");
        node.style.removeProperty("--dtsc-scroll-delay");
      });
    };
  }, [pathname]);

  return (
    <style>{`
      [data-dtsc-scroll-state] {
        animation: none !important;
      }

      [data-dtsc-scroll-state="pending"] {
        opacity: 0;
        transform: translate3d(0, 26px, 0) scale(0.992);
        transition:
          opacity 720ms cubic-bezier(0.16, 1, 0.3, 1) var(--dtsc-scroll-delay, 0ms),
          transform 720ms cubic-bezier(0.16, 1, 0.3, 1) var(--dtsc-scroll-delay, 0ms);
        will-change: opacity, transform;
      }

      [data-dtsc-scroll-state="visible"] {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
      }

      @media (prefers-reduced-motion: reduce) {
        [data-dtsc-scroll-state] {
          opacity: 1 !important;
          transform: none !important;
          transition: none !important;
        }
      }
    `}</style>
  );
}
