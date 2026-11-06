import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { hrReference, publishHrEvent } from "@/lib/enterprise/hr-payroll/helpers";
import type { employeeCreateSchema, employeeUpdateSchema } from "@/lib/enterprise/hr-payroll/schemas";
import { prisma } from "@/lib/prisma";

type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;
type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;

export async function createEnterpriseEmployee(organizationId: string, actorUserId: string, input: EmployeeCreateInput) {
  return prisma.$transaction(async (tx) => {
    if (input.organizationMemberId) {
      const member = await tx.organizationMember.findFirst({
        where: { id: input.organizationMemberId, organizationId, status: "ACTIVE", removedAt: null },
        select: { id: true },
      });
      if (!member) throw new EnterpriseDomainError("ORGANIZATION_MEMBER_NOT_FOUND", 404);
      const duplicate = await tx.enterpriseEmployee.findFirst({
        where: { organizationId, organizationMemberId: input.organizationMemberId, archivedAt: null },
        select: { id: true },
      });
      if (duplicate) throw new EnterpriseDomainError("EMPLOYEE_MEMBER_ALREADY_LINKED", 409);
    }

    if (input.businessPartyId) {
      const party = await tx.enterpriseBusinessParty.findFirst({
        where: { id: input.businessPartyId, organizationId, archivedAt: null },
        select: { id: true },
      });
      if (!party) throw new EnterpriseDomainError("BUSINESS_PARTY_NOT_FOUND", 404);
    }

    const position = input.positionId
      ? await tx.enterprisePosition.findFirst({ where: { id: input.positionId, organizationId, isActive: true }, select: { id: true, positionCode: true, departmentId: true } })
      : input.positionCode
        ? await tx.enterprisePosition.findFirst({ where: { organizationId, positionCode: input.positionCode, isActive: true }, select: { id: true, positionCode: true, departmentId: true } })
        : null;
    if ((input.positionId || input.positionCode) && !position) throw new EnterpriseDomainError("EMPLOYEE_POSITION_NOT_FOUND", 404);

    const department = input.departmentId
      ? await tx.enterpriseDepartment.findFirst({ where: { id: input.departmentId, organizationId, isActive: true }, select: { id: true } })
      : null;
    if (input.departmentId && !department) throw new EnterpriseDomainError("EMPLOYEE_DEPARTMENT_NOT_FOUND", 404);
    if (position?.departmentId && department && position.departmentId !== department.id) throw new EnterpriseDomainError("EMPLOYEE_POSITION_DEPARTMENT_MISMATCH", 409);

    if (input.managerEmployeeId) {
      const manager = await tx.enterpriseEmployee.findFirst({
        where: { id: input.managerEmployeeId, organizationId, employmentStatus: "ACTIVE", archivedAt: null },
        select: { id: true },
      });
      if (!manager) throw new EnterpriseDomainError("MANAGER_EMPLOYEE_NOT_FOUND", 404);
    }

    if (input.siteId) {
      const site = await tx.enterpriseSite.findFirst({ where: { id: input.siteId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
      if (!site) throw new EnterpriseDomainError("SITE_NOT_FOUND", 404);
    }

    const employee = await tx.enterpriseEmployee.create({
      data: {
        organizationId,
        employeeNumber: hrReference("EMP"),
        organizationMemberId: input.organizationMemberId || null,
        businessPartyId: input.businessPartyId || null,
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: `${input.firstName} ${input.lastName}`.trim(),
        workEmail: input.workEmail?.toLocaleLowerCase("fr") || null,
        workPhone: input.workPhone || null,
        positionId: position?.id || null,
        positionCode: position?.positionCode || null,
        departmentId: department?.id || position?.departmentId || null,
        managerEmployeeId: input.managerEmployeeId || null,
        siteId: input.siteId || null,
        hireDate: input.hireDate,
        employmentType: input.employmentType || null,
        baseCompensation: input.baseCompensation ?? null,
        compensationCurrency: input.compensationCurrency || null,
        createdByUserId: actorUserId,
      },
    });

    await publishHrEvent(tx, {
      organizationId,
      entityType: "EnterpriseEmployee",
      entityId: employee.id,
      eventType: "EMPLOYEE_CREATED",
      summary: `Employé ${employee.employeeNumber} créé`,
      actorUserId,
      toStatus: employee.employmentStatus,
      metadataJson: { positionId: employee.positionId, departmentId: employee.departmentId, siteId: employee.siteId },
    });
    return employee;
  });
}


/**
 * Employee details are edited through the canonical HR record. The membership
 * and consented account relationship deliberately remain outside this command.
 * Each change is revision guarded, tenant-scoped and auditable.
 */
export async function updateEnterpriseEmployee(
  organizationId: string,
  employeeId: string,
  actorUserId: string,
  input: EmployeeUpdateInput,
) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.enterpriseEmployee.findFirst({
      where: { id: employeeId, organizationId, archivedAt: null },
      select: { id: true, revision: true, employmentStatus: true },
    });
    if (!employee) throw new EnterpriseDomainError("EMPLOYEE_NOT_FOUND", 404);
    if (employee.revision !== input.revision) throw new EnterpriseDomainConflictError();
    if (input.managerEmployeeId === employeeId) throw new EnterpriseDomainError("EMPLOYEE_CANNOT_MANAGE_SELF", 409);

    const position = input.positionId
      ? await tx.enterprisePosition.findFirst({
          where: { id: input.positionId, organizationId, isActive: true },
          select: { id: true, positionCode: true, departmentId: true },
        })
      : input.positionCode
        ? await tx.enterprisePosition.findFirst({
            where: { organizationId, positionCode: input.positionCode, isActive: true },
            select: { id: true, positionCode: true, departmentId: true },
          })
        : null;
    if ((input.positionId || input.positionCode) && !position) throw new EnterpriseDomainError("EMPLOYEE_POSITION_NOT_FOUND", 404);

    const department = input.departmentId
      ? await tx.enterpriseDepartment.findFirst({
          where: { id: input.departmentId, organizationId, isActive: true },
          select: { id: true },
        })
      : null;
    if (input.departmentId && !department) throw new EnterpriseDomainError("EMPLOYEE_DEPARTMENT_NOT_FOUND", 404);
    if (position?.departmentId && department && position.departmentId !== department.id) {
      throw new EnterpriseDomainError("EMPLOYEE_POSITION_DEPARTMENT_MISMATCH", 409);
    }
    if (input.managerEmployeeId) {
      // Reject indirect as well as direct hierarchy cycles.
      const visited = new Set<string>([employeeId]);
      let managerId: string | null = input.managerEmployeeId;
      for (let depth = 0; managerId && depth < 100; depth++) {
        if (visited.has(managerId)) throw new EnterpriseDomainError("EMPLOYEE_MANAGER_CYCLE", 409);
        visited.add(managerId);
        const manager: { id: string; managerEmployeeId: string | null } | null = await tx.enterpriseEmployee.findFirst({
          where: { id: managerId, organizationId, archivedAt: null, employmentStatus: "ACTIVE" },
          select: { id: true, managerEmployeeId: true },
        });
        if (!manager) throw new EnterpriseDomainError("MANAGER_EMPLOYEE_NOT_FOUND", 404);
        managerId = manager.managerEmployeeId;
      }
      if (managerId) throw new EnterpriseDomainError("EMPLOYEE_MANAGER_HIERARCHY_TOO_DEEP", 409);
    }
    if (input.siteId) {
      const site = await tx.enterpriseSite.findFirst({
        where: { id: input.siteId, organizationId, status: "ACTIVE", archivedAt: null },
        select: { id: true },
      });
      if (!site) throw new EnterpriseDomainError("SITE_NOT_FOUND", 404);
    }

    const updated = await tx.enterpriseEmployee.updateMany({
      where: { id: employeeId, organizationId, revision: input.revision, archivedAt: null },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: `${input.firstName} ${input.lastName}`.trim(),
        workEmail: input.workEmail?.toLowerCase() || null,
        workPhone: input.workPhone || null,
        positionId: position?.id || null,
        positionCode: position?.positionCode || null,
        departmentId: department?.id || position?.departmentId || null,
        managerEmployeeId: input.managerEmployeeId || null,
        siteId: input.siteId || null,
        hireDate: input.hireDate,
        employmentType: input.employmentType || null,
        baseCompensation: input.baseCompensation ?? null,
        compensationCurrency: input.compensationCurrency || null,
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await publishHrEvent(tx, {
      organizationId, entityType: "EnterpriseEmployee", entityId: employeeId,
      eventType: "EMPLOYEE_UPDATED", summary: "Dossier collaborateur actualisé",
      actorUserId, fromStatus: employee.employmentStatus, toStatus: employee.employmentStatus,
      metadataJson: { previousRevision: input.revision },
    });
    return tx.enterpriseEmployee.findFirstOrThrow({ where: { id: employeeId, organizationId } });
  });
}

export async function archiveEnterpriseEmployee(
  organizationId: string,
  employeeId: string,
  actorUserId: string,
  revision: number,
) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.enterpriseEmployee.findFirst({
      where: { id: employeeId, organizationId, archivedAt: null },
      select: { id: true, revision: true, employmentStatus: true },
    });
    if (!employee) throw new EnterpriseDomainError("EMPLOYEE_NOT_FOUND", 404);
    if (employee.revision !== revision) throw new EnterpriseDomainConflictError();
    const [dependentContracts, directReports, pendingTime] = await Promise.all([
      tx.enterpriseEmploymentContract.count({
        where: { organizationId, employeeId, archivedAt: null, status: { in: ["ACTIVE", "PENDING_APPROVAL"] } },
      }),
      tx.enterpriseEmployee.count({ where: { organizationId, managerEmployeeId: employeeId, archivedAt: null, employmentStatus: "ACTIVE" } }),
      tx.enterpriseTimesheet.count({ where: { organizationId, employeeId, archivedAt: null, status: "SUBMITTED" } }),
    ]);
    if (dependentContracts || directReports || pendingTime) throw new EnterpriseDomainError("EMPLOYEE_ARCHIVE_DEPENDENCIES", 409);
    const updated = await tx.enterpriseEmployee.updateMany({
      where: { id: employeeId, organizationId, revision, archivedAt: null },
      data: { archivedAt: new Date(), updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await publishHrEvent(tx, {
      organizationId, entityType: "EnterpriseEmployee", entityId: employeeId,
      eventType: "EMPLOYEE_ARCHIVED", summary: "Dossier collaborateur archivé",
      actorUserId, fromStatus: employee.employmentStatus, toStatus: "ARCHIVED",
    });
    return { id: employeeId, archived: true };
  });
}

export async function restoreEnterpriseEmployee(
  organizationId: string,
  employeeId: string,
  actorUserId: string,
  revision: number,
) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.enterpriseEmployee.findFirst({
      where: { id: employeeId, organizationId, archivedAt: { not: null } },
      select: { id: true, revision: true, organizationMemberId: true, employmentStatus: true },
    });
    if (!employee) throw new EnterpriseDomainError("EMPLOYEE_ARCHIVE_NOT_FOUND", 404);
    if (employee.revision !== revision) throw new EnterpriseDomainConflictError();
    if (employee.organizationMemberId) {
      const duplicate = await tx.enterpriseEmployee.findFirst({
        where: { organizationId, organizationMemberId: employee.organizationMemberId, archivedAt: null, id: { not: employeeId } },
        select: { id: true },
      });
      if (duplicate) throw new EnterpriseDomainError("EMPLOYEE_MEMBER_ALREADY_LINKED", 409);
    }
    const updated = await tx.enterpriseEmployee.updateMany({
      where: { id: employeeId, organizationId, revision, archivedAt: { not: null } },
      data: { archivedAt: null, updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await publishHrEvent(tx, {
      organizationId, entityType: "EnterpriseEmployee", entityId: employeeId,
      eventType: "EMPLOYEE_RESTORED", summary: "Dossier collaborateur restauré",
      actorUserId, fromStatus: "ARCHIVED", toStatus: employee.employmentStatus,
    });
    return { id: employeeId, restored: true };
  });
}
