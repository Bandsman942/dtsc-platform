"use client";

import Link from "next/link";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { ModuleHeader } from "@/components/workspace/module-workspace";
import {
  ProductSectionNavigation,
  type ProductSectionIcon,
  type ProductSectionNavigationItem,
} from "@/components/workspace/product-section-navigation";
import {
  CONSOLE_SECTION_GROUP,
  CONSOLE_SECTION_GROUPS,
  type ConsoleSectionId,
} from "@/lib/console/console-routes";
import { getIteration07UserGuide, type Iteration07GuideCode } from "@/lib/user-guides/iteration07-guides";
import { translate } from "@/lib/i18n";

type AdminFloatingNavSection = {
  id: string;
  label: string;
  description: string;
  href: string;
};

const iconMap: Record<ConsoleSectionId, ProductSectionIcon> = {
  overview: "analytics",
  "module-maturity": "analytics",
  access: "rbac",
  "platform-settings": "settings",
  "ai-control-center": "analytics",
  promotions: "promotions",
  content: "content",
  users: "users",
  organizations: "building",
  subscriptions: "billing",
  support: "support",
  visits: "analytics",
  "security-audit": "rbac",
  "hr-cfo": "operations",
  sco: "operations",
  coo: "operations",
  ceo: "executive",
  mpo: "projects",
  cto: "cto",
  legal: "legal",
};

const guideMap: Record<ConsoleSectionId, Iteration07GuideCode> = {
  overview: "CONSOLE_OVERVIEW",
  "module-maturity": "DTSC_INTERNAL_ADMIN",
  access: "CONSOLE_RBAC",
  "platform-settings": "CONSOLE_PLATFORM_SETTINGS",
  "ai-control-center": "CONSOLE_AI_CONTROL",
  promotions: "CONSOLE_CONTENT",
  content: "CONSOLE_CONTENT",
  users: "CONSOLE_USERS",
  organizations: "CONSOLE_CLIENT_ENTERPRISES",
  subscriptions: "CONSOLE_SUBSCRIPTIONS",
  support: "CONSOLE_SUPPORT",
  visits: "CONSOLE_VISITS",
  "security-audit": "CONSOLE_SECURITY_AUDIT",
  "hr-cfo": "DTSC_HR_CFO",
  sco: "DTSC_SCO",
  coo: "DTSC_COO",
  ceo: "DTSC_CEO",
  mpo: "DTSC_MPO",
  cto: "DTSC_CTO",
  legal: "DTSC_LEGAL",
};

export function AdminFloatingNav({
  sections,
  activeSection,
  locale,
}: {
  sections: AdminFloatingNavSection[];
  activeSection: string;
  locale: "fr" | "en";
}) {
  const navigationSections: ProductSectionNavigationItem[] = sections.map((section) => {
    const sectionId = section.id as ConsoleSectionId;
    return {
      ...section,
      groupId: CONSOLE_SECTION_GROUP[sectionId] || "governance",
      icon: iconMap[sectionId] || "analytics",
    };
  });
  const groups = CONSOLE_SECTION_GROUPS.map((group) => ({
    id: group.id,
    label: locale === "en" ? group.labelEn : group.labelFr,
    description: locale === "en" ? group.descriptionEn : group.descriptionFr,
  }));
  const activeSectionId = (navigationSections.find((section) => section.id === activeSection)?.id || "overview") as ConsoleSectionId;
  const activeItem = navigationSections.find((section) => section.id === activeSection);
  const activeLabel = activeItem?.label || translate(locale, "console.title");
  const activeDescription = activeItem?.description || translate(locale, "console.description");
  const activeGroup = CONSOLE_SECTION_GROUP[activeSectionId];
  const relatedSections = navigationSections.filter((section) => section.groupId === activeGroup);
  const guide = getIteration07UserGuide(guideMap[activeSectionId], locale);
  const compactInternal = ["hr-cfo", "sco", "coo", "ceo", "mpo", "cto"].includes(activeSection);

  return (
    <>
      <div data-admin-modern-module-header className="min-w-0 max-w-full">
        {compactInternal ? <header data-dtsc-internal-compact-header className="flex min-w-0 items-center justify-between gap-3 border-b border-dtsc-border py-2">
          <div className="min-w-0 border-l-[3px] border-cyan-500 pl-3"><p className="text-[0.65rem] font-black uppercase tracking-widest text-dtsc-muted">{translate(locale, "console.eyebrow")}</p><h1 className="truncate text-lg font-black text-dtsc-ink">{activeLabel}</h1><p className="hidden truncate text-xs text-dtsc-muted sm:block">{activeDescription}</p></div>
          <ContextualUserGuide guide={guide} compact />
        </header> : <ModuleHeader
          eyebrow={translate(locale, "console.eyebrow")}
          title={activeLabel}
          description={activeDescription}
          secondaryActions={<ContextualUserGuide guide={guide} compact />}
        />}
      </div>
      <nav
        data-admin-workspace-tabs
        aria-label={translate(locale, "console.workspace.tabs")}
        className={`flex min-w-0 max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:thin] ${compactInternal ? "gap-1.5" : ""}`}
      >
        {relatedSections.map((section) => (
          <Link
            key={section.id}
            href={section.href}
            aria-current={activeSection === section.id ? "page" : undefined}
            className={`inline-flex shrink-0 items-center justify-center rounded-full border font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 ${compactInternal ? "min-h-10 px-3 py-1.5 text-xs" : "min-h-11 px-4 py-2 text-sm"} ${activeSection === section.id ? "border-cyan-400 bg-dtsc-blue text-white" : "border-dtsc-border bg-dtsc-surface text-dtsc-ink hover:border-cyan-400 hover:bg-dtsc-soft"}`}
          >
            {section.label}
          </Link>
        ))}
      </nav>
      <ProductSectionNavigation
        productLabel={translate(locale, "console.title")}
        title={translate(locale, "console.workspace.allSections")}
        desktopDisclosureLabel={translate(locale, "console.workspace.allSections")}
        compactDesktop
        mobileButtonLabel={translate(locale, "console.workspace.allSections")}
        mobileCloseButtonLabel={translate(locale, "console.workspace.closeSections")}
        groups={groups}
        sections={navigationSections}
        activeSection={activeSection}
      />
    </>
  );
}
