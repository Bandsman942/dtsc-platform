"use client";

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

  return (
    <>
      <ProductSectionNavigation
        productLabel={locale === "en" ? "DTSC administration" : "Administration DTSC"}
        title={locale === "en" ? "Authorized professional areas" : "Espaces professionnels autorisés"}
        groups={groups}
        sections={navigationSections}
        activeSection={activeSection}
      />
      <style jsx global>{`
        .dtsc-product-section-navigation + nav[aria-label="Sections Console DTSC"] {
          display: none !important;
        }
      `}</style>
    </>
  );
}
