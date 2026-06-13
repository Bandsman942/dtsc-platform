"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type RevealProps = {
  children: ReactNode;
  /** Render as a different element (e.g. "li", "article", "section"). Defaults to "div". */
  as?: ElementType;
  /** Stagger delay in ms, useful inside a mapped list. */
  delay?: number;
  className?: string;
};

/**
 * Lightweight scroll-reveal wrapper.
 * Reveals its children once when they enter the viewport, then disconnects.
 * Honors prefers-reduced-motion via the .dtsc-reveal CSS rules.
 */
export function Reveal({ children, as, delay = 0, className }: RevealProps) {
  const Tag = (as ?? "div") as ElementType;
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      data-visible={visible ? "true" : "false"}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn("dtsc-reveal", className)}
    >
      {children}
    </Tag>
  );
}
