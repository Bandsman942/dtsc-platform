import type { z } from "zod";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { hrReference, publishHrEvent } from "@/lib/enterprise/hr-payroll/helpers";
import type { employeeCreateSchema } from "@/lib/enterprise/hr-payroll/schemas";
import { prisma } from "@/lib/prisma";

type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;

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
