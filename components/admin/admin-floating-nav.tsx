"use client";

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
}: {
  sections: AdminFloatingNavSection[];
  activeSection: string;
}) {
  const locale = sections.some((section) => section.label === "Overview" || section.label === "Users & access") ? "en" : "fr";
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
  const activeLabel = navigationSections.find((section) => section.id === activeSection)?.label;
  const guide = getIteration07UserGuide(guideMap[activeSectionId], locale);

  return (
    <>
      <div data-admin-modern-module-header className="min-w-0 max-w-full">
        <ModuleHeader
          eyebrow={locale === "en" ? "DTSC management" : "Gestion DTSC"}
          title={locale === "en" ? "DTSC Administration" : "Administration DTSC"}
          count={activeLabel}
          description={locale === "en"
            ? "Manage client companies, subscriptions, support, security and internal operations from the areas available to you."
            : "Gérez les entreprises clientes, les abonnements, l’assistance, la sécurité et les opérations internes depuis les espaces auxquels vous avez accès."}
          secondaryActions={<ContextualUserGuide guide={guide} compact />}
        />
      </div>
      <ProductSectionNavigation
        productLabel={locale === "en" ? "DTSC administration" : "Administration DTSC"}
        title={locale === "en" ? "Available work areas" : "Espaces de travail disponibles"}
        groups={groups}
        sections={navigationSections}
        activeSection={activeSection}
      />
      <style jsx global>{`
        .dtsc-private-main > div > section.dtsc-panel:first-child {
          display: none !important;
        }
        .dtsc-product-section-navigation + nav[aria-label="Sections Console DTSC"] {
          display: none !important;
        }
      `}</style>
    </>
  );
}
