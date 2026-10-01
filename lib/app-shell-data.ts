import type { UserRole } from "@prisma/client";
import {
  getAccountMembershipSnapshot,
  getActiveAccountMemberships,
  getPendingAccountInvitations,
  type AccountMembershipSnapshot,
} from "@/lib/account/account-membership-snapshot";
import { createAppShellPerformanceRecorder } from "@/lib/app-shell-performance";
import { getUnreadCollaborationMessageCount } from "@/lib/collaboration";
import { getEnterpriseActivityBlocks } from "@/lib/enterprise/enterprise-activity-blocks-loader";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { getEnterpriseNavigationModules } from "@/lib/enterprise/enterprise-navigation";
import { ENTERPRISE_ADMIN_ROLES } from "@/lib/enterprise-sector-templates";
import { COMPANY_RELATIONSHIP_USER_ACTION_STATUSES } from "@/lib/navigation/company-relationships";
import { buildVisibleNotificationWhereForSession } from "@/lib/notification-access";
import { isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getVisiblePromotionalBannersForUser } from "@/lib/promotional-banners";
import type { SessionPayload } from "@/lib/session";

export type AppShellDataUser = {
  id: string;
  role: UserRole;
  locale?: string | null;
};

export async function loadAppShellData({
  user,
  session,
  membershipSnapshot: providedMembershipSnapshot,
}: {
  user: AppShellDataUser;
  session: SessionPayload | null;
  membershipSnapshot?: AccountMembershipSnapshot;
}) {
  const performanceRecorder = createAppShellPerformanceRecorder();
  const dtscInternalContext = isDtscInternalSession(session);
  const activeOrganizationId = session?.activeOrganizationId || null;
  const organizationContext = session?.activeContext === "ORGANIZATION" && Boolean(activeOrganizationId);
  const membershipSnapshot = providedMembershipSnapshot
    || await performanceRecorder.timed("organizationMemberships", getAccountMembershipSnapshot(user.id));
  const organizationMemberships = getActiveAccountMemberships(membershipSnapshot, 12);
  const pendingEnterpriseInvitations = getPendingAccountInvitations(membershipSnapshot).length;
  const notificationWhere = session
    ? buildVisibleNotificationWhereForSession(session, membershipSnapshot)
    : { userId: user.id, organizationId: null };
  const activeMembership = activeOrganizationId
    ? membershipSnapshot.find((membership) => membership.status === "ACTIVE" && membership.organizationId === activeOrganizationId) || null
    : null;
  const adminFastPath = organizationContext
    && Boolean(activeOrganizationId)
    && Boolean(activeMembership)
    && ENTERPRISE_ADMIN_ROLES.has(activeMembership?.role || "");

  const [
    unreadNotifications,
    unreadCollaboratorMessages,
    pendingCompanyRelationships,
    employeeRecord,
    enterpriseModules,
    enterpriseActivityBlocks,
    enterpriseAdminDecision,
    promotionalBanners,
  ] = await Promise.all([
    performanceRecorder.timed("unreadNotifications", prisma.notification.count({
      where: {
        ...notificationWhere,
        readAt: null,
      },
    })),
    performanceRecorder.timed("unreadCollaboratorMessages", getUnreadCollaborationMessageCount(session)),
    performanceRecorder.timed("pendingCompanyRelationships", prisma.enterpriseIdentityLink.count({
      where: {
        userId: user.id,
        status: { in: [...COMPANY_RELATIONSHIP_USER_ACTION_STATUSES] },
      },
    })),
    performanceRecorder.timed("employeeRecord", dtscInternalContext
      ? prisma.hrcfoEmployee.findFirst({
          where: { userId: user.id, status: { not: "EXITED" } },
          select: { id: true },
        })
      : Promise.resolve(null)),
    performanceRecorder.timed("enterpriseModules", organizationContext && activeOrganizationId
      ? getEnterpriseNavigationModules(activeOrganizationId, user.id, user.locale)
      : Promise.resolve([])),
    performanceRecorder.timed("enterpriseActivityBlocks", organizationContext && activeOrganizationId
      ? getEnterpriseActivityBlocks(activeOrganizationId, user.id)
      : Promise.resolve([])),
    performanceRecorder.timed("enterpriseAdminDecision", organizationContext && activeOrganizationId
      ? adminFastPath
        ? Promise.resolve({ allowed: true })
        : resolveEnterpriseModuleAccess({
            userId: user.id,
            organizationId: activeOrganizationId,
            moduleCode: "ADMIN_DASHBOARD",
            action: "manage",
          })
      : Promise.resolve(null)),
    performanceRecorder.timed("promotionalBanners", getVisiblePromotionalBannersForUser(user.id, user.role)),
  ]);

  const performance = performanceRecorder.finish({ organizationContext });
  return {
    activeOrganizationId,
    organizationContext,
    dtscInternalContext,
    organizationMemberships,
    pendingEnterpriseInvitations,
    unreadNotifications,
    unreadCollaboratorMessages,
    pendingCompanyRelationships,
    employeeRecord,
    enterpriseModules,
    enterpriseActivityBlocks,
    enterpriseAdminDecision,
    promotionalBanners,
    performance,
  };
}

export type AppShellData = Awaited<ReturnType<typeof loadAppShellData>>;
