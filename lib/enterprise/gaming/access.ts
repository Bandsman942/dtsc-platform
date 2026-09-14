import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import type { SessionPayload } from "@/lib/session";

export type GamingStationAction = "read" | "submit" | "write" | "manage";

export async function getEnterpriseGamingStationAccess({
  session,
  organizationId,
  action,
}: {
  session: SessionPayload;
  organizationId: string;
  action: GamingStationAction;
}) {
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership) return null;

  const capabilities = await resolveEnterpriseModuleCapabilities({
    userId: session.userId,
    organizationId,
    moduleCode: "GAMING_STATIONS",
  });

  const allowed = action === "read"
    ? capabilities.canRead
    : action === "submit"
      ? capabilities.canSubmit
      : action === "write"
        ? capabilities.canWrite
        : capabilities.canManage;

  if (!allowed) return null;

  return {
    membership,
    capabilities,
    canCreate: capabilities.canCreate,
    canWrite: capabilities.canWrite,
    canManage: capabilities.canManage,
  };
}
