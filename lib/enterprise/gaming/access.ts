import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import type { SessionPayload } from "@/lib/session";

export type GamingAccessAction = "read" | "submit" | "write" | "manage";
type GamingOperationalModuleCode = "GAMING_STATIONS" | "GAMING_SESSIONS" | "GAMING_BOOKINGS" | "GAMING_PRICING_PACKAGES" | "GAMING_CHECKOUT" | "GAMING_DAILY_CLOSE";

async function getEnterpriseGamingModuleAccess({
  session,
  organizationId,
  moduleCode,
  action,
}: {
  session: SessionPayload;
  organizationId: string;
  moduleCode: GamingOperationalModuleCode;
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

export function getEnterpriseGamingStationAccess({ session, organizationId, action }: { session: SessionPayload; organizationId: string; action: GamingAccessAction }) {
  return getEnterpriseGamingModuleAccess({ session, organizationId, moduleCode: "GAMING_STATIONS", action });
}

export function getEnterpriseGamingSessionAccess({ session, organizationId, action }: { session: SessionPayload; organizationId: string; action: GamingAccessAction }) {
  return getEnterpriseGamingModuleAccess({ session, organizationId, moduleCode: "GAMING_SESSIONS", action });
}

export function getEnterpriseGamingBookingAccess({ session, organizationId, action }: { session: SessionPayload; organizationId: string; action: GamingAccessAction }) {
  return getEnterpriseGamingModuleAccess({ session, organizationId, moduleCode: "GAMING_BOOKINGS", action });
}

export function getEnterpriseGamingPricingAccess({ session, organizationId, action }: { session: SessionPayload; organizationId: string; action: GamingAccessAction }) {
  return getEnterpriseGamingModuleAccess({ session, organizationId, moduleCode: "GAMING_PRICING_PACKAGES", action });
}

export function getEnterpriseGamingCheckoutAccess({ session, organizationId, action }: { session: SessionPayload; organizationId: string; action: GamingAccessAction }) {
  return getEnterpriseGamingModuleAccess({ session, organizationId, moduleCode: "GAMING_CHECKOUT", action });
}

export function getEnterpriseGamingDailyCloseAccess({ session, organizationId, action }: { session: SessionPayload; organizationId: string; action: GamingAccessAction }) {
  return getEnterpriseGamingModuleAccess({ session, organizationId, moduleCode: "GAMING_DAILY_CLOSE", action });
}
