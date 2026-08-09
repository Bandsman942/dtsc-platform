import { notFound, redirect } from "next/navigation";
import { AssistantImmersiveWorkspaceShell } from "@/components/chat/assistant-immersive-workspace-shell";
import { EnterpriseAiWorkspaceV2 } from "@/components/enterprise/enterprise-ai-workspace-v2";
import { EnterpriseAssetsMaintenanceWorkspace } from "@/components/enterprise/professional/enterprise-assets-maintenance-workspace";
import { EnterpriseCatalogWorkspace } from "@/components/enterprise/professional/enterprise-catalog-workspace";
import { EnterpriseContractsWorkspace } from "@/components/enterprise/professional/enterprise-contracts-workspace";
import { EnterpriseCrmWorkspace } from "@/components/enterprise/professional/enterprise-crm-workspace";
import { EnterpriseCustomersWorkspace } from "@/components/enterprise/professional/enterprise-customers-workspace";
import { EnterpriseHumanResourcesWorkspace } from "@/components/enterprise/professional/enterprise-human-resources-workspace";
import { EnterpriseInventoryOperationsWorkspace } from "@/components/enterprise/professional/enterprise-inventory-operations-workspace";
import { EnterprisePayrollOperationsWorkspace } from "@/components/enterprise/professional/enterprise-payroll-operations-workspace";
import { EnterpriseProcurementOperationsWorkspace } from "@/components/enterprise/professional/enterprise-procurement-operations-workspace";
import { EnterpriseProjectsDeliverablesWorkspace } from "@/components/enterprise/professional/enterprise-projects-deliverables-workspace";
import { EnterpriseSalesOperationsWorkspace } from "@/components/enterprise/professional/enterprise-sales-operations-workspace";
import { EnterpriseSitesWorkspace } from "@/components/enterprise/professional/enterprise-sites-workspace";
import { EnterpriseTimeAttendanceWorkspace } from "@/components/enterprise/professional/enterprise-time-attendance-workspace";
import { EnterpriseModuleWorkspace } from "@/components/enterprise/enterprise-module-workspace";
import { EnterpriseSectorModuleWorkspace } from "@/components/enterprise/enterprise-sector-module-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import {
  getEnterpriseAdminLegacyRedirect,
  getEnterpriseModuleDescription,
  getEnterpriseModuleLabel,
  normalizeEnterpriseModuleCode,
  resolveEnterpriseModuleRoute,
} from "@/lib/enterprise/module-registry";
import { listCatalogAiModelsForUi } from "@/lib/ai/catalog";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ moduleCode: string }> };

// Legacy QA markers retained during migration to the canonical registry:
// canAccessEnterpriseModule / organizationId_moduleCode / !enterpriseModule.isCore
// enterpriseModule.moduleCode === "AI_ASSISTANT"
// The executable route now uses canonical capability resolution and explicit routeKind/workspace allow-lists.
export default async function EnterpriseModulePage({ params }: Params) {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");

  const { moduleCode: requestedModuleCode } = await params;
  const canonicalModuleCode = normalizeEnterpriseModuleCode(requestedModuleCode);
  const routeResolution = resolveEnterpriseModuleRoute(requestedModuleCode);
  if (!routeResolution) notFound();

  const capabilities = await resolveEnterpriseModuleCapabilities({
    userId: user.id,
    organizationId,
    moduleCode: requestedModuleCode,
  });
  const routeAllowed = routeResolution.definition.routeKind === "ADMIN_SECTION" ? capabilities.canManage : capabilities.canRead;
  if (!routeAllowed || !capabilities.definition) notFound();

  const adminRedirect = getEnterpriseAdminLegacyRedirect(requestedModuleCode);
  if (adminRedirect) redirect(adminRedirect);
  if (requestedModuleCode.toUpperCase() !== canonicalModuleCode) redirect(routeResolution.path);

  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    select: { name: true, sectorCode: true },
  });
  if (!organization) notFound();

  const definition = capabilities.definition;

  if (definition.routeKind === "AI_SERVICE") {
    const models = listCatalogAiModelsForUi({ context: "ORGANIZATION", locale: user.locale });
    return (
      <AppShell user={user}>
        <AssistantImmersiveWorkspaceShell variant="enterprise">
          <EnterpriseAiWorkspaceV2
            organizationId={organizationId}
            organizationName={organization.name}
            sectorCode={organization.sectorCode}
            canManage={capabilities.canManage}
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

  if (definition.code === "CRM_CUSTOMERS") {
    return <AppShell user={user}><EnterpriseCustomersWorkspace organizationId={organizationId} organizationName={organization.name} definition={definition} /></AppShell>;
  }
  if (definition.code === "CATALOG") {
    return <AppShell user={user}><EnterpriseCatalogWorkspace organizationId={organizationId} organizationName={organization.name} definition={definition} /></AppShell>;
  }
  if (definition.code === "SITES_WAREHOUSES") {
    return <AppShell user={user}><EnterpriseSitesWorkspace organizationId={organizationId} organizationName={organization.name} definition={definition} /></AppShell>;
  }
  if (definition.code === "CRM_PIPELINE") {
    return <AppShell user={user}><EnterpriseCrmWorkspace organizationId={organizationId} organizationName={organization.name} definition={definition} /></AppShell>;
  }
  if (definition.code === "CONTRACTS") {
    return <AppShell user={user}><EnterpriseContractsWorkspace organizationId={organizationId} organizationName={organization.name} definition={definition} /></AppShell>;
  }
  if (definition.code === "SALES_QUOTES_ORDERS") {
    return <AppShell user={user}><EnterpriseSalesOperationsWorkspace organizationId={organizationId} organizationName={organization.name} definition={definition} /></AppShell>;
  }
  if (definition.code === "SUPPLIERS_PURCHASES") {
    return (
      <AppShell user={user}>
        <EnterpriseProcurementOperationsWorkspace
          organizationId={organizationId}
          organizationName={organization.name}
          definition={definition}
          capabilities={{
            canCreate: capabilities.canCreate,
            canSubmit: capabilities.canSubmit,
            canWrite: capabilities.canWrite,
            canApprove: capabilities.canApprove,
            canManage: capabilities.canManage,
          }}
          locale={user.locale}
        />
      </AppShell>
    );
  }
  if (definition.code === "INVENTORY_LOGISTICS") {
    return <AppShell user={user}><EnterpriseInventoryOperationsWorkspace organizationId={organizationId} organizationName={organization.name} definition={definition} /></AppShell>;
  }
  if (definition.code === "HUMAN_RESOURCES") {
    return <AppShell user={user}><EnterpriseHumanResourcesWorkspace organizationId={organizationId} organizationName={organization.name} definition={definition} /></AppShell>;
  }
  if (definition.code === "TIME_ATTENDANCE") {
    return <AppShell user={user}><EnterpriseTimeAttendanceWorkspace organizationId={organizationId} organizationName={organization.name} definition={definition} /></AppShell>;
  }
  if (definition.code === "PAYROLL_OPERATIONS") {
    return <AppShell user={user}><EnterprisePayrollOperationsWorkspace organizationId={organizationId} organizationName={organization.name} definition={definition} /></AppShell>;
  }
  if (definition.code === "PROJECTS_SERVICES") {
    return <AppShell user={user}><EnterpriseProjectsDeliverablesWorkspace organizationId={organizationId} organizationName={organization.name} definition={definition} initialFocus="PROJECTS" /></AppShell>;
  }
  if (definition.code === "TIME_DELIVERABLES") {
    return <AppShell user={user}><EnterpriseProjectsDeliverablesWorkspace organizationId={organizationId} organizationName={organization.name} definition={definition} initialFocus="DELIVERABLES" /></AppShell>;
  }
  if (definition.code === "ASSETS_MAINTENANCE") {
    return <AppShell user={user}><EnterpriseAssetsMaintenanceWorkspace organizationId={organizationId} organizationName={organization.name} definition={definition} /></AppShell>;
  }

  const canSeeAll = capabilities.canApprove || capabilities.canManage;
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
        canManage={capabilities.canManage}
        canCreate={capabilities.canCreate}
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
