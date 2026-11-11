"use client";

import { useEffect } from "react";

const ALLOWED_SECTIONS = new Set([
  "overview",
  "members",
  "positions",
  "departments",
  "permissions",
  "modules",
  "subscription",
  "settings",
  "security",
  "audit",
  "pending",
]);

export function EnterpriseAdminSectionActivator({ section }: { section?: string | null }) {
  useEffect(() => {
    if (!section || !ALLOWED_SECTIONS.has(section)) {
      return;
    }
    const target = document.getElementById(`enterprise-admin-${section}`);
    if (!target) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const sectionButton = target.querySelector<HTMLButtonElement>('button[data-workspace-section-header]');
      if (sectionButton && sectionButton.getAttribute("aria-expanded") !== "true") {
        sectionButton.click();
      } else {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [section]);

  return null;
}
