import type { Prisma, EnterpriseEmploymentContract } from "@prisma/client";
import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import {
  assertActiveCustomerEmployee,
  assertOrganizationApprovalDecision,
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
type ContractReferenceInput = Pick<ContractCreateInput, "jobTitle" | "departmentId" | "siteId">;

async function resolveContractReferences(tx: Prisma.TransactionClient, organizationId: string, input: ContractReferenceInput) {
  const position = input.jobTitle
    ? await tx.enterprisePosition.findFirst({
        where: { organizationId, positionCode: input.jobTitle, isActive: true },
        select: { id: true, positionCode: true, departmentId: true, labelFr: true, labelEn: true },
      })
    : null;
  if (input.jobTitle && !position) throw new EnterpriseDomainError("EMPLOYMENT_CONTRACT_POSITION_NOT_FOUND", 404);

  const department = input.departmentId
    ? await tx.enterpriseDepartment.findFirst({ where: { id: input.departmentId, organizationId, isActive: true }, select: { id: true } })
    : null;
  if (input.departmentId && !department) throw new EnterpriseDomainError("EMPLOYMENT_CONTRACT_DEPARTMENT_NOT_FOUND", 404);
  if (position?.departmentId && department && position.departmentId !== department.id) throw new EnterpriseDomainError("EMPLOYMENT_CONTRACT_POSITION_DEPARTMENT_MISMATCH", 409);

  const site = input.siteId
    ? await tx.enterpriseSite.findFirst({ where: { id: input.siteId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } })
    : null;
  if (input.siteId && !site) throw new EnterpriseDomainError("SITE_NOT_FOUND", 404);

  return { position, departmentId: department?.id || position?.departmentId || null, siteId: site?.id || null };
}

function ensureContractDates(input: Pick<ContractCreateInput, "startDate" | "endDate" | "probationEndDate">) {
  if (input.endDate && input.endDate < input.startDate) throw new EnterpriseDomainError("EMPLOYMENT_CONTRACT_DATE_RANGE_INVALID", 409);
  if (input.probationEndDate && input.probationEndDate < input.startDate) throw new EnterpriseDomainError("EMPLOYMENT_CONTRACT_PROBATION_INVALID", 409);
  if (input.endDate && input.probationEndDate && input.probationEndDate > input.endDate) throw new EnterpriseDomainError("EMPLOYMENT_CONTRACT_PROBATION_INVALID", 409);
}

export async function createEnterpriseEmploymentContract(organizationId: string, actorUserId: string, input: ContractCreateInput) {
  ensureContractDates(input);
  return prisma.$transaction(async (tx) => {
    const employee = await assertActiveCustomerEmployee(tx, organizationId, input.employeeId);
    await assertOrganizationApprover(tx, organizationId, input.approverUserId, actorUserId, "HUMAN_RESOURCES");
    const references = await resolveContractReferences(tx, organizationId, input);

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
        // Legacy column: keep the canonical position code here so activation can never inject a free-text title into the employee master record.
        jobTitle: references.position?.positionCode || null,
        departmentId: references.departmentId,
        siteId: references.siteId,
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
      metadataJson: { positionId: references.position?.id || null, departmentId: references.departmentId, siteId: references.siteId },
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
  ensureContractDates(input as ContractCreateInput);
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
    const references = await resolveContractReferences(tx, organizationId, input);

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
        jobTitle: references.position?.positionCode || null,
        departmentId: references.departmentId,
        siteId: references.siteId,
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
      metadataJson: { previousRevision: contract.revision, positionId: references.position?.id || null },
    });
    return tx.enterpriseEmploymentContract.findUniqueOrThrow({ where: { id: contract.id } });
  });
}

async function resolveContractPosition(tx: Prisma.TransactionClient, organizationId: string, contract: EnterpriseEmploymentContract) {
  if (!contract.jobTitle) return null;
  const position = await tx.enterprisePosition.findFirst({
    where: { organizationId, positionCode: contract.jobTitle, isActive: true },
    select: { id: true, positionCode: true, departmentId: true },
  });
  if (!position) throw new EnterpriseDomainError("EMPLOYMENT_CONTRACT_POSITION_NOT_FOUND", 409);
  return position;
}

export async function decideEnterpriseEmploymentContract(organizationId: string, contractId: string, actorUserId: string, input: ContractDecisionInput) {
  const pending = await prisma.enterpriseApproval.findFirst({
    where: { organizationId, targetEntityType: "EnterpriseEmploymentContract", targetEntityId: contractId, status: "PENDING", archivedAt: null },
    select: { requestedByUserId: true, approverUserId: true },
  });
  if (!pending) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);
  await assertOrganizationApprovalDecision({
    organizationId,
    requesterUserId: pending.requestedByUserId,
    approverUserId: pending.approverUserId,
    actorUserId,
    moduleCode: "HUMAN_RESOURCES",
  });

  return prisma.$transaction(async (tx) => {
    const contract = await tx.enterpriseEmploymentContract.findFirst({
      where: { id: contractId, organizationId, status: "PENDING_APPROVAL", archivedAt: null },
    });
    if (!contract) throw new EnterpriseDomainError("EMPLOYMENT_CONTRACT_NOT_FOUND", 404);
    const approval = await tx.enterpriseApproval.findFirst({
      where: { organizationId, targetEntityType: "EnterpriseEmploymentContract", targetEntityId: contract.id, status: "PENDING", approverUserId: actorUserId, archivedAt: null },
    });
    if (!approval) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);

    if (input.decision === "REJECT") {
      const updated = await tx.enterpriseEmploymentContract.updateMany({
        where: { id: contract.id, organizationId, revision: input.revision, status: "PENDING_APPROVAL" },
        data: { status: "DRAFT", revision: { increment: 1 } },
      });
      if (updated.count !== 1) throw new EnterpriseDomainConflictError();
      await tx.enterpriseApproval.update({
        where: { id: approval.id },
        data: { status: "REJECTED", decidedAt: new Date(), decisionComment: input.comment, revision: { increment: 1 } },
      });
      await publishHrEvent(tx, { organizationId, entityType: "EnterpriseEmploymentContract", entityId: contract.id, eventType: "EMPLOYMENT_CONTRACT_REJECTED", summary: `Contrat ${contract.reference} rejeté`, actorUserId, fromStatus: "PENDING_APPROVAL", toStatus: "DRAFT" });
      return tx.enterpriseEmploymentContract.findUniqueOrThrow({ where: { id: contract.id } });
    }

    const position = await resolveContractPosition(tx, organizationId, contract);
    if (contract.departmentId) {
      const department = await tx.enterpriseDepartment.findFirst({ where: { id: contract.departmentId, organizationId, isActive: true }, select: { id: true } });
      if (!department) throw new EnterpriseDomainError("EMPLOYMENT_CONTRACT_DEPARTMENT_NOT_FOUND", 409);
    }
    if (contract.siteId) {
      const site = await tx.enterpriseSite.findFirst({ where: { id: contract.siteId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
      if (!site) throw new EnterpriseDomainError("SITE_NOT_FOUND", 409);
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
        positionId: position?.id || null,
        positionCode: position?.positionCode || null,
        departmentId: contract.departmentId || position?.departmentId || null,
        siteId: contract.siteId || null,
        revision: { increment: 1 },
      },
    });
    await tx.enterpriseApproval.update({ where: { id: approval.id }, data: { status: "APPROVED", decidedAt: new Date(), decisionComment: input.comment || null, revision: { increment: 1 } } });
    await publishHrEvent(tx, { organizationId, entityType: "EnterpriseEmploymentContract", entityId: contract.id, eventType: "EMPLOYMENT_CONTRACT_ACTIVATED", summary: `Contrat ${contract.reference} activé`, actorUserId, fromStatus: "PENDING_APPROVAL", toStatus: "ACTIVE", metadataJson: { positionId: position?.id || null, departmentId: contract.departmentId || position?.departmentId || null, siteId: contract.siteId || null } });
    return tx.enterpriseEmploymentContract.findUniqueOrThrow({ where: { id: contract.id } });
  });
}
