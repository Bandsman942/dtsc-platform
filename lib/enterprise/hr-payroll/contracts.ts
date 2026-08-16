import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import {
  assertActiveCustomerEmployee,
  assertOrganizationApprover,
  hrReference,
  publishHrEvent,
} from "@/lib/enterprise/hr-payroll/helpers";
import type {
  employmentContractCreateSchema,
  employmentContractDecisionSchema,
  employmentContractUpdateSchema,
} from "@/lib/enterprise/hr-payroll/schemas";
import { prisma } from "@/lib/prisma";

type ContractCreateInput = z.infer<typeof employmentContractCreateSchema>;
type ContractUpdateInput = z.infer<typeof employmentContractUpdateSchema>;
type ContractDecisionInput = z.infer<typeof employmentContractDecisionSchema>;

export async function createEnterpriseEmploymentContract(organizationId: string, actorUserId: string, input: ContractCreateInput) {
  return prisma.$transaction(async (tx) => {
    const employee = await assertActiveCustomerEmployee(tx, organizationId, input.employeeId);
    await assertOrganizationApprover(tx, organizationId, input.approverUserId, actorUserId, "HUMAN_RESOURCES");
    const activeContract = await tx.enterpriseEmploymentContract.findFirst({
      where: { organizationId, employeeId: employee.id, status: "ACTIVE", archivedAt: null },
      orderBy: { versionNumber: "desc" },
    });
    const latest = await tx.enterpriseEmploymentContract.findFirst({
      where: { organizationId, employeeId: employee.id, archivedAt: null },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const contract = await tx.enterpriseEmploymentContract.create({
      data: {
        organizationId,
        employeeId: employee.id,
        reference: hrReference("ECT"),
        contractType: input.contractType,
        status: "PENDING_APPROVAL",
        versionNumber: (latest?.versionNumber || 0) + 1,
        supersedesContractId: activeContract?.id || null,
        startDate: input.startDate,
        endDate: input.endDate || null,
        probationEndDate: input.probationEndDate || null,
        jobTitle: input.jobTitle || null,
        departmentId: input.departmentId || null,
        siteId: input.siteId || null,
        baseCompensation: input.baseCompensation,
        compensationCurrency: input.compensationCurrency,
        payFrequency: input.payFrequency,
        standardHoursPerWeek: input.standardHoursPerWeek ?? null,
        terms: input.terms || null,
        createdByUserId: actorUserId,
      },
    });
    await tx.enterpriseApproval.create({
      data: {
        organizationId,
        targetEntityType: "EnterpriseEmploymentContract",
        targetEntityId: contract.id,
        requestedByUserId: actorUserId,
        approverUserId: input.approverUserId,
      },
    });
    await publishHrEvent(tx, {
      organizationId,
      entityType: "EnterpriseEmploymentContract",
      entityId: contract.id,
      eventType: "EMPLOYMENT_CONTRACT_SUBMITTED",
      summary: `Contrat ${contract.reference} soumis`,
      actorUserId,
      toStatus: "PENDING_APPROVAL",
    });
    return contract;
  });
}

export async function updateEnterpriseEmploymentContract(
  organizationId: string,
  contractId: string,
  actorUserId: string,
  input: ContractUpdateInput,
) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.enterpriseEmploymentContract.findFirst({
      where: {
        id: contractId,
        organizationId,
        status: { in: ["DRAFT", "PENDING_APPROVAL"] },
        archivedAt: null,
      },
    });
    if (!contract) throw new EnterpriseDomainError("EMPLOYMENT_CONTRACT_NOT_EDITABLE", 409);
    if (contract.createdByUserId !== actorUserId) throw new EnterpriseDomainError("EMPLOYMENT_CONTRACT_EDIT_FORBIDDEN", 403);

    await assertOrganizationApprover(tx, organizationId, input.approverUserId, actorUserId, "HUMAN_RESOURCES");

    const updated = await tx.enterpriseEmploymentContract.updateMany({
      where: {
        id: contract.id,
        organizationId,
        revision: input.revision,
        status: contract.status,
        archivedAt: null,
      },
      data: {
        contractType: input.contractType,
        status: "PENDING_APPROVAL",
        startDate: input.startDate,
        endDate: input.endDate || null,
        probationEndDate: input.probationEndDate || null,
        jobTitle: input.jobTitle || null,
        departmentId: input.departmentId || null,
        siteId: input.siteId || null,
        baseCompensation: input.baseCompensation,
        compensationCurrency: input.compensationCurrency,
        payFrequency: input.payFrequency,
        standardHoursPerWeek: input.standardHoursPerWeek ?? null,
        terms: input.terms || null,
        approvedAt: null,
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();

    const supersededAt = new Date();
    await tx.enterpriseApproval.updateMany({
      where: {
        organizationId,
        targetEntityType: "EnterpriseEmploymentContract",
        targetEntityId: contract.id,
        status: "PENDING",
        archivedAt: null,
      },
      data: {
        status: "SUPERSEDED",
        decidedAt: supersededAt,
        decisionComment: "Contract revised by its creator before approval.",
        archivedAt: supersededAt,
        revision: { increment: 1 },
      },
    });
    await tx.enterpriseApproval.create({
      data: {
        organizationId,
        targetEntityType: "EnterpriseEmploymentContract",
        targetEntityId: contract.id,
        requestedByUserId: actorUserId,
        approverUserId: input.approverUserId,
      },
    });
    await publishHrEvent(tx, {
      organizationId,
      entityType: "EnterpriseEmploymentContract",
      entityId: contract.id,
      eventType: "EMPLOYMENT_CONTRACT_UPDATED_RESUBMITTED",
      summary: `Contrat ${contract.reference} modifié et resoumis`,
      actorUserId,
      fromStatus: contract.status,
      toStatus: "PENDING_APPROVAL",
      metadataJson: { previousRevision: contract.revision },
    });
    return tx.enterpriseEmploymentContract.findUniqueOrThrow({ where: { id: contract.id } });
  });
}

export async function decideEnterpriseEmploymentContract(organizationId: string, contractId: string, actorUserId: string, input: ContractDecisionInput) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.enterpriseEmploymentContract.findFirst({
      where: { id: contractId, organizationId, status: "PENDING_APPROVAL", archivedAt: null },
    });
    if (!contract) throw new EnterpriseDomainError("EMPLOYMENT_CONTRACT_NOT_FOUND", 404);
    const approval = await tx.enterpriseApproval.findFirst({
      where: { organizationId, targetEntityType: "EnterpriseEmploymentContract", targetEntityId: contract.id, status: "PENDING", approverUserId: actorUserId, archivedAt: null },
    });
    if (!approval) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);
    if (approval.requestedByUserId === actorUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);

    if (input.decision === "REJECT") {
      const updated = await tx.enterpriseEmploymentContract.updateMany({
        where: { id: contract.id, organizationId, revision: input.revision, status: "PENDING_APPROVAL" },
        data: { status: "DRAFT", revision: { increment: 1 } },
      });
      if (updated.count !== 1) throw new EnterpriseDomainConflictError();
      await tx.enterpriseApproval.update({
        where: { id: approval.id },
        data: { status: "REJECTED", decidedAt: new Date(), decisionComment: input.comment || null, revision: { increment: 1 } },
      });
      return tx.enterpriseEmploymentContract.findUniqueOrThrow({ where: { id: contract.id } });
    }

    const previousActive = await tx.enterpriseEmploymentContract.findFirst({
      where: { organizationId, employeeId: contract.employeeId, status: "ACTIVE", archivedAt: null, id: { not: contract.id } },
      orderBy: { versionNumber: "desc" },
    });
    if (previousActive) {
      await tx.enterpriseEmploymentContract.update({
        where: { id: previousActive.id },
        data: { status: "ENDED", endedAt: contract.startDate, endReason: `Remplacé par ${contract.reference}`, revision: { increment: 1 } },
      });
    }
    const updated = await tx.enterpriseEmploymentContract.updateMany({
      where: { id: contract.id, organizationId, revision: input.revision, status: "PENDING_APPROVAL" },
      data: { status: "ACTIVE", approvedAt: new Date(), activatedAt: new Date(), revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await tx.enterpriseEmployee.update({
      where: { id: contract.employeeId },
      data: {
        baseCompensation: contract.baseCompensation,
        compensationCurrency: contract.compensationCurrency,
        employmentType: contract.contractType,
        positionCode: contract.jobTitle || undefined,
        departmentId: contract.departmentId || undefined,
        siteId: contract.siteId || undefined,
        revision: { increment: 1 },
      },
    });
    await tx.enterpriseApproval.update({ where: { id: approval.id }, data: { status: "APPROVED", decidedAt: new Date(), decisionComment: input.comment || null, revision: { increment: 1 } } });
    await publishHrEvent(tx, { organizationId, entityType: "EnterpriseEmploymentContract", entityId: contract.id, eventType: "EMPLOYMENT_CONTRACT_ACTIVATED", summary: `Contrat ${contract.reference} activé`, actorUserId, fromStatus: "PENDING_APPROVAL", toStatus: "ACTIVE" });
    return tx.enterpriseEmploymentContract.findUniqueOrThrow({ where: { id: contract.id } });
  });
}
