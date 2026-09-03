"use client";

import { EnterpriseAssetsMaintenanceWorkspaceV2 } from "@/components/enterprise/professional/enterprise-assets-maintenance-workspace-v2";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

export function EnterpriseAssetsMaintenanceWorkspace({
  organizationId,
  organizationName,
  definition,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
}) {
  return <EnterpriseAssetsMaintenanceWorkspaceV2 organizationId={organizationId} organizationName={organizationName} definition={definition} />;
}