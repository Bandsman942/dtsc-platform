import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import type { SessionPayload } from "@/lib/session";

export type GamingAccessAction = "read" | "submit" | "write" | "manage";

async function getEnterpriseGamingModuleAccess({
  session,
  organizationId,
  moduleCode,
  action,
}: {
  session: SessionPayload;
  organizationId: string;
  moduleCode: "GAMING_STATIONS" | "GAMING_SESSIONS" | "GAMING_BOOKINGS";
  action: GamingAccessAction;
}) {
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership) return null;

  const capabilities = await resolveEnterpriseModuleCapabilities({
    userId: session.userId,
    organizationId,
    moduleCode,
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

export function getEnterpriseGamingStationAccess({
  session,
  organizationId,
  action,
}: {
  session: SessionPayload;
  organizationId: string;
  action: GamingAccessAction;
}) {
  return getEnterpriseGamingModuleAccess({ session, organizationId, moduleCode: "GAMING_STATIONS", action });
}

export function getEnterpriseGamingSessionAccess({
  session,
  organizationId,
  action,
}: {
  session: SessionPayload;
  organizationId: string;
  action: GamingAccessAction;
}) {
  return getEnterpriseGamingModuleAccess({ session, organizationId, moduleCode: "GAMING_SESSIONS", action });
}

export function getEnterpriseGamingBookingAccess({
  session,
  organizationId,
  action,
}: {
  session: SessionPayload;
  organizationId: string;
  action: GamingAccessAction;
}) {
  return getEnterpriseGamingModuleAccess({ session, organizationId, moduleCode: "GAMING_BOOKINGS", action });
}
