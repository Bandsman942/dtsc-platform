import {
  getEnterpriseModuleDefinition,
  type EnterpriseModuleDefinition,
  type EnterpriseModuleNavigationGroup,
} from "@/lib/enterprise/module-registry";

export const ENTERPRISE_NAVIGATION_GROUP_ORDER: Record<EnterpriseModuleNavigationGroup, number> = {
  OPERATIONS: 10,
  COMMERCIAL: 20,
  PROCUREMENT_RESOURCES: 30,
  HUMAN_RESOURCES: 40,
  PROJECTS_ASSETS: 50,
  FINANCE: 60,
  SECTOR_HEALTH: 70,
  SECTOR_PHARMACY: 70,
  INTELLIGENCE: 80,
  ADMINISTRATION: 90,
};

export function compareEnterpriseModuleDefinitions(
  left: EnterpriseModuleDefinition,
  right: EnterpriseModuleDefinition,
) {
  return (
    ENTERPRISE_NAVIGATION_GROUP_ORDER[left.navigationGroup] -
      ENTERPRISE_NAVIGATION_GROUP_ORDER[right.navigationGroup] ||
    left.navigationOrder - right.navigationOrder ||
    left.labelFr.localeCompare(right.labelFr, "fr")
  );
}

export function compareEnterpriseModuleRows(
  left: { moduleCode: string; sortOrder?: number | null; labelFr?: string | null },
  right: { moduleCode: string; sortOrder?: number | null; labelFr?: string | null },
) {
  const leftDefinition = getEnterpriseModuleDefinition(left.moduleCode);
  const rightDefinition = getEnterpriseModuleDefinition(right.moduleCode);
  if (leftDefinition && rightDefinition) {
    return compareEnterpriseModuleDefinitions(leftDefinition, rightDefinition);
  }
  if (leftDefinition) return -1;
  if (rightDefinition) return 1;
  return (
    (left.sortOrder || 0) - (right.sortOrder || 0) ||
    (left.labelFr || left.moduleCode).localeCompare(right.labelFr || right.moduleCode, "fr")
  );
}
