import { notFound, redirect } from "next/navigation";
import { EnterpriseModuleWorkspace } from "@/components/enterprise/enterprise-module-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { canAccessEnterpriseModule, ENTERPRISE_MANAGER_ROLES, requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ moduleCode: string }> };

export default async function EnterpriseModulePage({ params }: Params) {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");
  const { moduleCode } = await params;
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership || !(await canAccessEnterpriseModule(user.id, organizationId, moduleCode, "read"))) notFound();

  const [organization, enterpriseModule, activityBlocks, records, members, departments, positions, workflows, requests, calendarEvents, audits, coreRecords] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    prisma.enterpriseModule.findUnique({ where: { organizationId_moduleCode: { organizationId, moduleCode } } }),
    prisma.enterpriseActivityBlock.findMany({ where: { organizationId, isEnabled: true, targetModuleCode: moduleCode }, orderBy: { sortOrder: "asc" }, select: { id: true, labelFr: true, labelEn: true, blockCode: true } }),
    prisma.enterpriseSectorRecord.findMany({ where: { organizationId, moduleCode, deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, title: true, summary: true, status: true, updatedAt: true } }),
    prisma.organizationMember.findMany({ where: { organizationId, removedAt: null }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, role: true, status: true, joinedAt: true, user: { select: { id: true, name: true, email: true } } } }),
    prisma.enterpriseDepartment.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }], take: 30, select: { id: true, labelFr: true, departmentCode: true, isActive: true } }),
    prisma.enterprisePosition.findMany({ where: { organizationId }, orderBy: [{ hierarchyLevel: "asc" }, { labelFr: "asc" }], take: 30, select: { id: true, labelFr: true, positionCode: true, isActive: true } }),
    prisma.enterpriseWorkflow.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, labelFr: true, isEnabled: true, updatedAt: true } }),
    prisma.enterpriseActivityRequest.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true, status: true, priority: true, blockCode: true, updatedAt: true } }),
    prisma.internalCalendarEvent.findMany({ where: { organizationId, deletedAt: null }, orderBy: { startDateTime: "desc" }, take: 20, select: { id: true, title: true, status: true, startDateTime: true } }),
    prisma.auditLog.findMany({ where: { metadata: { path: ["organizationId"], equals: organizationId } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, action: true, entity: true, createdAt: true } }),
    prisma.enterpriseCoreRecord.findMany({
      where: {
        organizationId,
        moduleCode,
        archivedAt: null,
        ...(ENTERPRISE_MANAGER_ROLES.has(membership.role) ? {} : { OR: [{ createdById: user.id }, { requestedById: user.id }, { assignedToUserId: user.id }, { validatorUserId: user.id }] }),
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true, moduleCode: true, recordType: true, title: true, description: true, status: true, priority: true, assignedToUserId: true,
        validatorUserId: true, dueAt: true, sourceModule: true, sourceEntityType: true, sourceEntityId: true, updatedAt: true,
        events: { orderBy: { createdAt: "desc" }, take: 4, select: { id: true, summary: true, eventType: true, createdAt: true } },
        comments: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 4, select: { id: true, content: true, createdAt: true } },
      },
    }),
  ]);
  if (!organization || !enterpriseModule || !enterpriseModule.isCore) notFound();

  return (
    <AppShell user={user}>
      <EnterpriseModuleWorkspace
        organizationId={organizationId}
        organizationName={organization.name}
        enterpriseModule={{ code: enterpriseModule.moduleCode, label: user.locale === "en" ? enterpriseModule.labelEn : enterpriseModule.labelFr, description: user.locale === "en" ? enterpriseModule.descriptionEn || enterpriseModule.moduleCode : enterpriseModule.descriptionFr || enterpriseModule.moduleCode, category: enterpriseModule.moduleCategory, isCore: enterpriseModule.isCore, icon: enterpriseModule.icon }}
        activityBlocks={activityBlocks}
        records={records}
        coreData={{ members, departments, positions, workflows, requests, calendarEvents, audits }}
        canManage={ENTERPRISE_MANAGER_ROLES.has(membership.role)}
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
