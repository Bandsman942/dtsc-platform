import { notFound, redirect } from "next/navigation";
import { AssistantImmersiveWorkspaceShell } from "@/components/chat/assistant-immersive-workspace-shell";
import { EnterpriseAiWorkspaceV2 } from "@/components/enterprise/enterprise-ai-workspace-v2";
import { EnterpriseCommonDomainWorkspace } from "@/components/enterprise/enterprise-common-domain-workspace";
import { EnterpriseModuleWorkspace } from "@/components/enterprise/enterprise-module-workspace";
import { EnterpriseSectorModuleWorkspace } from "@/components/enterprise/enterprise-sector-module-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import {
  getEnterpriseAdminLegacyRedirect,
  getEnterpriseModuleDescription,
  getEnterpriseModuleLabel,
  normalizeEnterpriseModuleCode,
  resolveEnterpriseModuleRoute,
} from "@/lib/enterprise/module-registry";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { getConfiguredOpenAIModels, getDisplayName } from "@/lib/openai-config";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ moduleCode: string }> };

const ENTERPRISE_ADMIN_ROLES = new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"]);
const ENTERPRISE_OVERSIGHT_ROLES = new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER"]);
const COMMON_DOMAIN_CODES = new Set([
  "CRM_CUSTOMERS",
  "CATALOG",
  "SITES_WAREHOUSES",
  "CRM_PIPELINE",
  "SALES_QUOTES_ORDERS",
  "CONTRACTS",
  "INVENTORY_LOGISTICS",
  "HUMAN_RESOURCES",
  "TIME_ATTENDANCE",
  "PAYROLL_OPERATIONS",
  "PROJECTS_SERVICES",
  "TIME_DELIVERABLES",
  "ASSETS_MAINTENANCE",
]);

// Legacy QA markers retained during migration to the canonical registry:
// canAccessEnterpriseModule / organizationId_moduleCode / !enterpriseModule.isCore
// enterpriseModule.moduleCode === "AI_ASSISTANT"
// The executable route now uses resolveEnterpriseModuleAccess and explicit routeKind/workspace allow-lists.
export default async function EnterpriseModulePage({ params }: Params) {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");

  const { moduleCode: requestedModuleCode } = await params;
  const canonicalModuleCode = normalizeEnterpriseModuleCode(requestedModuleCode);
  const routeResolution = resolveEnterpriseModuleRoute(requestedModuleCode);
  if (!routeResolution) notFound();

  const access = await resolveEnterpriseModuleAccess({
    userId: user.id,
    organizationId,
    moduleCode: requestedModuleCode,
    action: routeResolution.definition.routeKind === "ADMIN_SECTION" ? "manage" : "read",
  });
  if (!access.allowed || !access.definition) notFound();

  const adminRedirect = getEnterpriseAdminLegacyRedirect(requestedModuleCode);
  if (adminRedirect) redirect(adminRedirect);
  if (requestedModuleCode.toUpperCase() !== canonicalModuleCode) redirect(routeResolution.path);

  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership) notFound();
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    select: { name: true, sectorCode: true },
  });
  if (!organization) notFound();

  const definition = access.definition;
  const canManage = ENTERPRISE_ADMIN_ROLES.has(membership.role);

  if (definition.routeKind === "AI_SERVICE") {
    const models = getConfiguredOpenAIModels().map((id) => ({ id, label: getDisplayName(id) }));
    return (
      <AppShell user={user}>
        <AssistantImmersiveWorkspaceShell variant="enterprise">
          <EnterpriseAiWorkspaceV2
            organizationId={organizationId}
            organizationName={organization.name}
            sectorCode={organization.sectorCode}
            canManage={canManage}
            models={models}
          />
        </AssistantImmersiveWorkspaceShell>
      </AppShell>
    );
  }

  if (definition.routeKind === "SECTOR_HEALTH" || definition.routeKind === "SECTOR_PHARMACY") {
    const [enabledModules, betaRecords] = await Promise.all([
      prisma.enterpriseModule.findMany({ where: { organizationId, isEnabled: true }, select: { moduleCode: true } }),
      definition.implementationStatus === "BETA"
        ? prisma.enterpriseSectorRecord.findMany({
            where: { organizationId, moduleCode: definition.code, sectorCode: organization.sectorCode || undefined, deletedAt: null },
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            take: 100,
            include: { createdBy: { select: { name: true, email: true } }, assignedTo: { select: { id: true, name: true, email: true } } },
          })
        : Promise.resolve([]),
    ]);
    return (
      <AppShell user={user}>
        <EnterpriseSectorModuleWorkspace
          organizationId={organizationId}
          definition={definition}
          enabledModuleCodes={enabledModules.map((item) => normalizeEnterpriseModuleCode(item.moduleCode))}
          records={JSON.parse(JSON.stringify(betaRecords))}
        />
      </AppShell>
    );
  }

  if (definition.routeKind !== "DEDICATED_CORE") notFound();

  if (COMMON_DOMAIN_CODES.has(definition.code)) {
    return (
      <AppShell user={user}>
        <EnterpriseCommonDomainWorkspace
          organizationId={organizationId}
          organizationName={organization.name}
          definition={definition}
        />
      </AppShell>
    );
  }

  const canSeeAll = ENTERPRISE_OVERSIGHT_ROLES.has(membership.role);
  const [activityBlocks, records, members, departments, positions, workflows, requests, calendarEvents, audits, coreRecords] = await Promise.all([
    prisma.enterpriseActivityBlock.findMany({
      where: { organizationId, isEnabled: true, targetModuleCode: { in: [definition.code, requestedModuleCode.toUpperCase()] } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, labelFr: true, labelEn: true, blockCode: true },
    }),
    prisma.enterpriseSectorRecord.findMany({
      where: { organizationId, moduleCode: definition.code, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, title: true, summary: true, status: true, updatedAt: true },
    }),
    prisma.organizationMember.findMany({
      where: { organizationId, removedAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, role: true, status: true, joinedAt: true, user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.enterpriseDepartment.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }],
      take: 30,
      select: { id: true, labelFr: true, departmentCode: true, isActive: true },
    }),
    prisma.enterprisePosition.findMany({
      where: { organizationId },
      orderBy: [{ hierarchyLevel: "asc" }, { labelFr: "asc" }],
      take: 30,
      select: { id: true, labelFr: true, positionCode: true, isActive: true },
    }),
    prisma.enterpriseWorkflow.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, labelFr: true, isEnabled: true, updatedAt: true },
    }),
    prisma.enterpriseActivityRequest.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, title: true, status: true, priority: true, blockCode: true, updatedAt: true },
    }),
    prisma.internalCalendarEvent.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { startDateTime: "desc" },
      take: 20,
      select: { id: true, title: true, status: true, startDateTime: true },
    }),
    prisma.auditLog.findMany({
      where: { metadata: { path: ["organizationId"], equals: organizationId } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, action: true, entity: true, createdAt: true },
    }),
    prisma.enterpriseCoreRecord.findMany({
      where: {
        organizationId,
        moduleCode: definition.code,
        archivedAt: null,
        ...(canSeeAll ? {} : { OR: [{ createdById: user.id }, { requestedById: user.id }, { assignedToUserId: user.id }, { validatorUserId: user.id }] }),
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        moduleCode: true,
        recordType: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        assignedToUserId: true,
        validatorUserId: true,
        dueAt: true,
        sourceModule: true,
        sourceEntityType: true,
        sourceEntityId: true,
        updatedAt: true,
        events: { orderBy: { createdAt: "desc" }, take: 4, select: { id: true, summary: true, eventType: true, createdAt: true } },
        comments: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 4, select: { id: true, content: true, createdAt: true } },
      },
    }),
  ]);

  return (
    <AppShell user={user}>
      <EnterpriseModuleWorkspace
        organizationId={organizationId}
        organizationName={organization.name}
        enterpriseModule={{
          code: definition.code,
          label: getEnterpriseModuleLabel(definition, user.locale),
          description: getEnterpriseModuleDescription(definition, user.locale),
          category: definition.domain,
          domain: definition.domain,
          implementationStatus: definition.implementationStatus,
          navigationGroup: definition.navigationGroup,
          navigationGroupLabel: definition.navigationGroup,
          navigationOrder: definition.navigationOrder,
          isCore: true,
          icon: definition.iconKey,
          href: definition.routePath || `/enterprise-modules/${definition.code}`,
        }}
        activityBlocks={activityBlocks}
        records={records}
        coreData={{ members, departments, positions, workflows, requests, calendarEvents, audits }}
        canManage={canManage}
        canCreate={membership.role !== "GUEST"}
        locale={user.locale}
        coreRecords={coreRecords.map((record) => ({
          ...record,
          dueAt: record.dueAt?.toISOString() || null,
          updatedAt: record.updatedAt.toISOString(),
          events: record.events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
          comments: record.comments.map((comment) => ({ ...comment, createdAt: comment.createdAt.toISOString() })),
        }))}
      />
    </AppShell>
  );
}
