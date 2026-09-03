"use client";

import { EnterpriseProjectsServicesWorkspace } from "@/components/enterprise/professional/enterprise-projects-services-workspace";
import { EnterpriseTimeDeliverablesWorkspace } from "@/components/enterprise/professional/enterprise-time-deliverables-workspace";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

export function EnterpriseProjectsDeliverablesWorkspace({
  organizationId,
  organizationName,
  definition,
  initialFocus,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  initialFocus: "PROJECTS" | "DELIVERABLES";
}) {
  if (initialFocus === "DELIVERABLES") {
    return <EnterpriseTimeDeliverablesWorkspace organizationId={organizationId} organizationName={organizationName} definition={definition} />;
  }
  return <EnterpriseProjectsServicesWorkspace organizationId={organizationId} organizationName={organizationName} definition={definition} />;
}