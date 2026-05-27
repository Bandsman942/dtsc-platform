import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";
import { hasActiveOrganizationSubscription, requireActiveOrganizationMembership } from "@/lib/organizations";

export const ENTERPRISE_ADMIN_ROLES = new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"]);
export const ENTERPRISE_MANAGER_ROLES = new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER"]);

export type SectorTemplatePreview = {
  sector: {
    id: string;
    code: string;
    labelFr: string;
    labelEn: string;
    descriptionFr: string | null;
    descriptionEn: string | null;
    icon: string | null;
    color: string | null;
  };
  modules: Array<{ code: string; labelFr: string; labelEn: string; category: string; icon: string | null; isCore: boolean }>;
  positions: Array<{ code: string; labelFr: string; labelEn: string; departmentCode: string | null; isKeyPosition: boolean }>;
  departments: Array<{ code: string; labelFr: string; labelEn: string }>;
  activityBlocks: Array<{ code: string; labelFr: string; labelEn: string; targetModuleCode: string | null; icon: string | null }>;
  workflows: Array<{ code: string; labelFr: string; labelEn: string }>;
};

export type ApplySectorTemplateMode = "merge" | "replace_sector";

function isEnterpriseAdminRole(role: string | null | undefined) {
  return role ? ENTERPRISE_ADMIN_ROLES.has(role) : false;
}

function isEnterpriseManagerRole(role: string | null | undefined) {
  return role ? ENTERPRISE_MANAGER_ROLES.has(role) : false;
}

export async function listBusinessSectors() {
  return prisma.businessSector.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }],
    select: {
      id: true,
      code: true,
      labelFr: true,
      labelEn: true,
      descriptionFr: true,
      descriptionEn: true,
      isicReferenceCode: true,
      icon: true,
      color: true,
      sortOrder: true,
    },
  });
}

export async function getSectorTemplatePreview(sectorIdOrCode: string): Promise<SectorTemplatePreview | null> {
  const sector = await prisma.businessSector.findFirst({
    where: {
      isActive: true,
      OR: [{ id: sectorIdOrCode }, { code: sectorIdOrCode }],
    },
    include: {
      templates: {
        where: { isActive: true },
        orderBy: { version: "desc" },
        take: 1,
        include: {
          modules: { orderBy: [{ moduleCategory: "asc" }, { sortOrder: "asc" }, { labelFr: "asc" }] },
          positions: { orderBy: [{ hierarchyLevel: "asc" }, { sortOrder: "asc" }, { labelFr: "asc" }] },
          departments: { orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }] },
          activityBlocks: { orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }] },
          workflows: { orderBy: [{ workflowCode: "asc" }] },
        },
      },
    },
  });

  const template = sector?.templates[0];
  if (!sector || !template) {
    return null;
  }

  return {
    sector: {
      id: sector.id,
      code: sector.code,
      labelFr: sector.labelFr,
      labelEn: sector.labelEn,
      descriptionFr: sector.descriptionFr,
      descriptionEn: sector.descriptionEn,
      icon: sector.icon,
      color: sector.color,
    },
    modules: template.modules.map((templateModule) => ({
      code: templateModule.moduleCode,
      labelFr: templateModule.labelFr,
      labelEn: templateModule.labelEn,
      category: templateModule.moduleCategory,
      icon: templateModule.icon,
      isCore: templateModule.moduleCategory === "CORE",
    })),
    positions: template.positions.map((position) => ({
      code: position.positionCode,
      labelFr: position.labelFr,
      labelEn: position.labelEn,
      departmentCode: position.departmentCode,
      isKeyPosition: position.isKeyPosition,
    })),
    departments: template.departments.map((department) => ({
      code: department.departmentCode,
      labelFr: department.labelFr,
      labelEn: department.labelEn,
    })),
    activityBlocks: template.activityBlocks.map((block) => ({
      code: block.blockCode,
      labelFr: block.labelFr,
      labelEn: block.labelEn,
      targetModuleCode: block.targetModuleCode,
      icon: block.icon,
    })),
    workflows: template.workflows.map((workflow) => ({
      code: workflow.workflowCode,
      labelFr: workflow.labelFr,
      labelEn: workflow.labelEn,
    })),
  };
}

export async function canManageEnterpriseAdministration(userId: string, organizationId: string) {
  const membership = await prisma.organizationMember.findFirst({
    where: {
      userId,
      organizationId,
      status: "ACTIVE",
      removedAt: null,
      organization: { status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    },
    select: { role: true },
  });

  return isEnterpriseManagerRole(membership?.role);
}

export async function canAccessEnterpriseModule(userId: string, organizationId: string, moduleCode: string, action: "read" | "submit" | "write" | "manage" = "read") {
  const membership = await prisma.organizationMember.findFirst({
    where: {
      userId,
      organizationId,
      status: "ACTIVE",
      removedAt: null,
      organization: { status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    },
    select: { role: true },
  });
  if (!membership) {
    return false;
  }

  const enterpriseModule = await prisma.enterpriseModule.findUnique({
    where: { organizationId_moduleCode: { organizationId, moduleCode } },
    select: { isEnabled: true, requiresPlanLevel: true },
  });
  if (!enterpriseModule?.isEnabled) {
    return false;
  }

  if (enterpriseModule.requiresPlanLevel && !(await hasActiveOrganizationSubscription(organizationId))) {
    return false;
  }

  if (isEnterpriseAdminRole(membership.role)) {
    return true;
  }
  if (membership.role === "MANAGER") {
    return action !== "manage";
  }
  return action === "read" || action === "submit";
}

export async function canAccessEnterpriseActivity(userId: string, organizationId: string, blockCode: string, action: "read" | "submit" | "manage" = "read") {
  const membership = await prisma.organizationMember.findFirst({
    where: {
      userId,
      organizationId,
      status: "ACTIVE",
      removedAt: null,
      organization: { status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    },
    select: { role: true },
  });
  if (!membership) {
    return false;
  }

  const block = await prisma.enterpriseActivityBlock.findUnique({
    where: { organizationId_blockCode: { organizationId, blockCode } },
    select: { isEnabled: true, targetModuleCode: true },
  });
  if (!block?.isEnabled) {
    return false;
  }
  if (action === "manage") {
    return isEnterpriseManagerRole(membership.role);
  }
  if (block.targetModuleCode) {
    return canAccessEnterpriseModule(userId, organizationId, block.targetModuleCode, action === "submit" ? "submit" : "read");
  }
  return true;
}

export async function requireEnterpriseMembership(session: SessionPayload, organizationId: string) {
  const membership = await requireActiveOrganizationMembership(session, organizationId);
  if (!membership || membership.organization.organizationType !== "CLIENT") {
    return null;
  }
  return membership;
}

export async function applySectorTemplateToOrganization({
  organizationId,
  sectorId,
  actorUserId,
  mode = "merge",
}: {
  organizationId: string;
  sectorId: string;
  actorUserId: string;
  mode?: ApplySectorTemplateMode;
}) {
  const sector = await prisma.businessSector.findFirst({
    where: { id: sectorId, isActive: true },
    include: {
      templates: {
        where: { isActive: true },
        orderBy: { version: "desc" },
        take: 1,
        include: {
          modules: { orderBy: [{ moduleCategory: "asc" }, { sortOrder: "asc" }] },
          departments: { orderBy: { sortOrder: "asc" } },
          positions: { orderBy: [{ hierarchyLevel: "asc" }, { sortOrder: "asc" }] },
          activityBlocks: { orderBy: { sortOrder: "asc" } },
          workflows: true,
        },
      },
    },
  });

  const template = sector?.templates[0];
  if (!sector || !template) {
    throw new Error("SECTOR_TEMPLATE_NOT_FOUND");
  }

  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.update({
      where: { id: organizationId },
      data: {
        sectorId: sector.id,
        sectorCode: sector.code,
        sector: sector.labelFr,
        industry: sector.labelFr,
      },
      select: { id: true, name: true },
    });

    if (mode === "replace_sector") {
      await tx.enterpriseActivityBlock.updateMany({
        where: { organizationId, isEnabled: true, sectorId: { not: null } },
        data: { isEnabled: false },
      });
      await tx.enterpriseModule.updateMany({
        where: { organizationId, isEnabled: true, isCore: false, sectorId: { not: null } },
        data: { isEnabled: false },
      });
    }

    const departmentsByCode = new Map<string, string>();
    for (const department of template.departments) {
      const saved = await tx.enterpriseDepartment.upsert({
        where: { organizationId_departmentCode: { organizationId, departmentCode: department.departmentCode } },
        update: {
          labelFr: department.labelFr,
          labelEn: department.labelEn,
          descriptionFr: department.descriptionFr,
          descriptionEn: department.descriptionEn,
          isActive: true,
          sortOrder: department.sortOrder,
          sourceTemplateId: department.id,
        },
        create: {
          organizationId,
          departmentCode: department.departmentCode,
          labelFr: department.labelFr,
          labelEn: department.labelEn,
          descriptionFr: department.descriptionFr,
          descriptionEn: department.descriptionEn,
          isActive: true,
          sortOrder: department.sortOrder,
          sourceTemplateId: department.id,
        },
        select: { id: true, departmentCode: true },
      });
      departmentsByCode.set(saved.departmentCode, saved.id);
    }

    const modules = [];
    for (const templateModule of template.modules) {
      const isCore = templateModule.moduleCategory === "CORE";
      const savedModule = await tx.enterpriseModule.upsert({
        where: { organizationId_moduleCode: { organizationId, moduleCode: templateModule.moduleCode } },
        update: {
          sectorId: isCore ? null : sector.id,
          labelFr: templateModule.labelFr,
          labelEn: templateModule.labelEn,
          descriptionFr: templateModule.descriptionFr,
          descriptionEn: templateModule.descriptionEn,
          moduleCategory: templateModule.moduleCategory,
          icon: templateModule.icon,
          isEnabled: templateModule.defaultEnabled,
          isCore,
          sourceTemplateId: templateModule.id,
          requiresPlanLevel: templateModule.requiresPlanLevel,
          sortOrder: templateModule.sortOrder,
        },
        create: {
          organizationId,
          sectorId: isCore ? null : sector.id,
          moduleCode: templateModule.moduleCode,
          labelFr: templateModule.labelFr,
          labelEn: templateModule.labelEn,
          descriptionFr: templateModule.descriptionFr,
          descriptionEn: templateModule.descriptionEn,
          moduleCategory: templateModule.moduleCategory,
          icon: templateModule.icon,
          isEnabled: templateModule.defaultEnabled,
          isCore,
          sourceTemplateId: templateModule.id,
          requiresPlanLevel: templateModule.requiresPlanLevel,
          sortOrder: templateModule.sortOrder,
        },
      });
      modules.push(savedModule);
      await tx.enterpriseAdminSection.upsert({
        where: { organizationId_sectionCode: { organizationId, sectionCode: templateModule.moduleCode } },
        update: {
          moduleId: savedModule.id,
          labelFr: templateModule.labelFr,
          labelEn: templateModule.labelEn,
          descriptionFr: templateModule.descriptionFr,
          descriptionEn: templateModule.descriptionEn,
          icon: templateModule.icon,
          isEnabled: templateModule.defaultEnabled,
          requiredPermission: `module:${templateModule.moduleCode}:manage`,
          sortOrder: templateModule.sortOrder,
          sourceTemplateId: templateModule.id,
        },
        create: {
          organizationId,
          moduleId: savedModule.id,
          sectionCode: templateModule.moduleCode,
          labelFr: templateModule.labelFr,
          labelEn: templateModule.labelEn,
          descriptionFr: templateModule.descriptionFr,
          descriptionEn: templateModule.descriptionEn,
          icon: templateModule.icon,
          isEnabled: templateModule.defaultEnabled,
          requiredPermission: `module:${templateModule.moduleCode}:manage`,
          sortOrder: templateModule.sortOrder,
          sourceTemplateId: templateModule.id,
        },
      });
    }

    for (const position of template.positions) {
      await tx.enterprisePosition.upsert({
        where: { organizationId_positionCode: { organizationId, positionCode: position.positionCode } },
        update: {
          sectorId: sector.id,
          labelFr: position.labelFr,
          labelEn: position.labelEn,
          departmentId: position.departmentCode ? departmentsByCode.get(position.departmentCode) || null : null,
          hierarchyLevel: position.hierarchyLevel,
          descriptionFr: position.descriptionFr,
          descriptionEn: position.descriptionEn,
          permissionsJson: position.defaultPermissionsJson === null ? Prisma.JsonNull : position.defaultPermissionsJson,
          isActive: true,
          isKeyPosition: position.isKeyPosition,
          sourceTemplateId: position.id,
        },
        create: {
          organizationId,
          sectorId: sector.id,
          positionCode: position.positionCode,
          labelFr: position.labelFr,
          labelEn: position.labelEn,
          departmentId: position.departmentCode ? departmentsByCode.get(position.departmentCode) || null : null,
          hierarchyLevel: position.hierarchyLevel,
          descriptionFr: position.descriptionFr,
          descriptionEn: position.descriptionEn,
          permissionsJson: position.defaultPermissionsJson === null ? Prisma.JsonNull : position.defaultPermissionsJson,
          isActive: true,
          isKeyPosition: position.isKeyPosition,
          sourceTemplateId: position.id,
        },
      });
    }

    for (const block of template.activityBlocks) {
      await tx.enterpriseActivityBlock.upsert({
        where: { organizationId_blockCode: { organizationId, blockCode: block.blockCode } },
        update: {
          sectorId: sector.id,
          labelFr: block.labelFr,
          labelEn: block.labelEn,
          descriptionFr: block.descriptionFr,
          descriptionEn: block.descriptionEn,
          icon: block.icon,
          targetModuleCode: block.targetModuleCode,
          isEnabled: block.defaultEnabled,
          requiredPermission: block.targetModuleCode ? `module:${block.targetModuleCode}:submit` : null,
          sortOrder: block.sortOrder,
          sourceTemplateId: block.id,
        },
        create: {
          organizationId,
          sectorId: sector.id,
          blockCode: block.blockCode,
          labelFr: block.labelFr,
          labelEn: block.labelEn,
          descriptionFr: block.descriptionFr,
          descriptionEn: block.descriptionEn,
          icon: block.icon,
          targetModuleCode: block.targetModuleCode,
          isEnabled: block.defaultEnabled,
          requiredPermission: block.targetModuleCode ? `module:${block.targetModuleCode}:submit` : null,
          sortOrder: block.sortOrder,
          sourceTemplateId: block.id,
        },
      });
    }

    for (const workflow of template.workflows) {
      await tx.enterpriseWorkflow.upsert({
        where: { organizationId_workflowCode: { organizationId, workflowCode: workflow.workflowCode } },
        update: {
          labelFr: workflow.labelFr,
          labelEn: workflow.labelEn,
          descriptionFr: workflow.descriptionFr,
          descriptionEn: workflow.descriptionEn,
          stepsJson: workflow.stepsJson === null ? Prisma.JsonNull : workflow.stepsJson,
          isEnabled: workflow.defaultEnabled,
          sourceTemplateId: workflow.id,
        },
        create: {
          organizationId,
          workflowCode: workflow.workflowCode,
          labelFr: workflow.labelFr,
          labelEn: workflow.labelEn,
          descriptionFr: workflow.descriptionFr,
          descriptionEn: workflow.descriptionEn,
          stepsJson: workflow.stepsJson === null ? Prisma.JsonNull : workflow.stepsJson,
          isEnabled: workflow.defaultEnabled,
          sourceTemplateId: workflow.id,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: "ENTERPRISE_SECTOR_TEMPLATE_APPLIED",
        entity: "Organization",
        entityId: organizationId,
        metadata: {
          organizationName: organization.name,
          sectorCode: sector.code,
          mode,
          modules: template.modules.length,
          positions: template.positions.length,
          activityBlocks: template.activityBlocks.length,
        },
      },
    });

    return {
      organizationId,
      sectorCode: sector.code,
      modulesCreatedOrUpdated: modules.length,
      positionsCreatedOrUpdated: template.positions.length,
      departmentsCreatedOrUpdated: template.departments.length,
      activityBlocksCreatedOrUpdated: template.activityBlocks.length,
      workflowsCreatedOrUpdated: template.workflows.length,
    };
  });
}
