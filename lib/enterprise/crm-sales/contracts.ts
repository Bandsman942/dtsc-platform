import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import {
  assertActiveClientOrganization,
  enterpriseReference,
  normalizeEnterpriseName,
  publishEnterpriseEvent,
} from "@/lib/enterprise/crm-sales/helpers";
import type { contractCreateSchema, contractTransitionSchema, contractUpdateSchema } from "@/lib/enterprise/crm-sales/schemas";
import { prisma } from "@/lib/prisma";

type ContractCreateInput = z.infer<typeof contractCreateSchema>;
type ContractTransitionInput = z.infer<typeof contractTransitionSchema>;
type ContractUpdateInput = z.infer<typeof contractUpdateSchema>;

const CONTRACT_COUNTERPARTY_PREFIXES = {
  employee: "employee:",
  member: "member:",
  supplier: "supplier:",
} as const;

async function ensureContractPartyRole(
  tx: Prisma.TransactionClient,
  organizationId: string,
  businessPartyId: string,
  roleCode: string,
  actorUserId: string,
) {
  await tx.enterpriseBusinessPartyRole.upsert({
    where: {
      organizationId_businessPartyId_roleCode: {
        organizationId,
        businessPartyId,
        roleCode,
      },
    },
    update: { status: "ACTIVE", archivedAt: null },
    create: {
      organizationId,
      businessPartyId,
      roleCode,
      createdByUserId: actorUserId,
    },
  });
}

async function findMatchingContractParty(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: { legalName: string; primaryEmail?: string | null; partyType: string },
) {
  const normalizedName = normalizeEnterpriseName(input.legalName);
  return tx.enterpriseBusinessParty.findFirst({
    where: {
      organizationId,
      status: "ACTIVE",
      archivedAt: null,
      OR: [
        ...(input.primaryEmail
          ? [{ primaryEmail: { equals: input.primaryEmail, mode: "insensitive" as const } }]
          : []),
        { normalizedName, partyType: input.partyType },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
}

async function createContractParty(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorUserId: string,
  input: {
    legalName: string;
    displayName?: string | null;
    partyType: string;
    primaryEmail?: string | null;
    primaryPhone?: string | null;
    roleCode: string;
  },
) {
  const party = await tx.enterpriseBusinessParty.create({
    data: {
      organizationId,
      partyType: input.partyType,
      legalName: input.legalName,
      displayName: input.displayName || null,
      normalizedName: normalizeEnterpriseName(input.legalName),
      code: enterpriseReference(input.partyType === "PERSON" ? "PER" : "ORG"),
      primaryEmail: input.primaryEmail?.trim().toLowerCase() || null,
      primaryPhone: input.primaryPhone || null,
      createdByUserId: actorUserId,
    },
    select: { id: true },
  });
  await ensureContractPartyRole(tx, organizationId, party.id, input.roleCode, actorUserId);
  return party.id;
}

async function resolveContractBusinessParty(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorUserId: string,
  selectionId: string,
) {
  if (selectionId.startsWith(CONTRACT_COUNTERPARTY_PREFIXES.employee)) {
    const employeeId = selectionId.slice(CONTRACT_COUNTERPARTY_PREFIXES.employee.length);
    const employee = await tx.enterpriseEmployee.findFirst({
      where: { id: employeeId, organizationId, employmentStatus: "ACTIVE", archivedAt: null },
      select: {
        id: true,
        businessPartyId: true,
        displayName: true,
        workEmail: true,
        workPhone: true,
      },
    });
    if (!employee) throw new EnterpriseDomainError("CONTRACT_EMPLOYEE_NOT_FOUND", 404);

    if (employee.businessPartyId) {
      const existing = await tx.enterpriseBusinessParty.findFirst({
        where: { id: employee.businessPartyId, organizationId, status: "ACTIVE", archivedAt: null },
        select: { id: true },
      });
      if (existing) {
        await ensureContractPartyRole(tx, organizationId, existing.id, "EMPLOYEE", actorUserId);
        return existing.id;
      }
    }

    const matched = await findMatchingContractParty(tx, organizationId, {
      legalName: employee.displayName,
      primaryEmail: employee.workEmail,
      partyType: "PERSON",
    });
    const businessPartyId = matched?.id || await createContractParty(tx, organizationId, actorUserId, {
      legalName: employee.displayName,
      displayName: employee.displayName,
      partyType: "PERSON",
      primaryEmail: employee.workEmail,
      primaryPhone: employee.workPhone,
      roleCode: "EMPLOYEE",
    });
    await ensureContractPartyRole(tx, organizationId, businessPartyId, "EMPLOYEE", actorUserId);
    await tx.enterpriseEmployee.updateMany({
      where: { id: employee.id, organizationId, archivedAt: null },
      data: { businessPartyId, updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    return businessPartyId;
  }

  if (selectionId.startsWith(CONTRACT_COUNTERPARTY_PREFIXES.supplier)) {
    const supplierId = selectionId.slice(CONTRACT_COUNTERPARTY_PREFIXES.supplier.length);
    const supplier = await tx.enterpriseSupplier.findFirst({
      where: { id: supplierId, organizationId, archivedAt: null },
      select: {
        id: true,
        legalName: true,
        displayName: true,
        supplierType: true,
        email: true,
        phone: true,
      },
    });
    if (!supplier) throw new EnterpriseDomainError("CONTRACT_SUPPLIER_NOT_FOUND", 404);

    const existingLink = await tx.enterpriseSupplierPartyLink.findFirst({
      where: { organizationId, supplierId: supplier.id, archivedAt: null },
      select: { businessPartyId: true },
    });
    if (existingLink) {
      const existing = await tx.enterpriseBusinessParty.findFirst({
        where: { id: existingLink.businessPartyId, organizationId, status: "ACTIVE", archivedAt: null },
        select: { id: true },
      });
      if (existing) {
        await ensureContractPartyRole(tx, organizationId, existing.id, "SUPPLIER", actorUserId);
        return existing.id;
      }
    }

    const partyType = supplier.supplierType === "PERSON" ? "PERSON" : "ORGANIZATION";
    const matched = await findMatchingContractParty(tx, organizationId, {
      legalName: supplier.legalName,
      primaryEmail: supplier.email,
      partyType,
    });
    const businessPartyId = matched?.id || await createContractParty(tx, organizationId, actorUserId, {
      legalName: supplier.legalName,
      displayName: supplier.displayName,
      partyType,
      primaryEmail: supplier.email,
      primaryPhone: supplier.phone,
      roleCode: "SUPPLIER",
    });
    await ensureContractPartyRole(tx, organizationId, businessPartyId, "SUPPLIER", actorUserId);
    await tx.enterpriseSupplierPartyLink.upsert({
      where: { organizationId_supplierId: { organizationId, supplierId: supplier.id } },
      update: { businessPartyId, archivedAt: null, revision: { increment: 1 } },
      create: {
        organizationId,
        supplierId: supplier.id,
        businessPartyId,
        createdByUserId: actorUserId,
      },
    });
    return businessPartyId;
  }

  if (selectionId.startsWith(CONTRACT_COUNTERPARTY_PREFIXES.member)) {
    const userId = selectionId.slice(CONTRACT_COUNTERPARTY_PREFIXES.member.length);
    const membership = await tx.organizationMember.findFirst({
      where: { organizationId, userId, status: "ACTIVE", removedAt: null },
      select: {
        id: true,
        userId: true,
        user: { select: { name: true, email: true } },
      },
    });
    if (!membership) throw new EnterpriseDomainError("CONTRACT_COLLABORATOR_NOT_FOUND", 404);

    const employee = await tx.enterpriseEmployee.findFirst({
      where: {
        organizationId,
        organizationMemberId: membership.id,
        employmentStatus: "ACTIVE",
        archivedAt: null,
      },
      select: { id: true },
    });
    if (employee) {
      return resolveContractBusinessParty(
        tx,
        organizationId,
        actorUserId,
        `${CONTRACT_COUNTERPARTY_PREFIXES.employee}${employee.id}`,
      );
    }

    const legalName = membership.user.name || membership.user.email;
    const matched = await findMatchingContractParty(tx, organizationId, {
      legalName,
      primaryEmail: membership.user.email,
      partyType: "PERSON",
    });
    const businessPartyId = matched?.id || await createContractParty(tx, organizationId, actorUserId, {
      legalName,
      displayName: membership.user.name,
      partyType: "PERSON",
      primaryEmail: membership.user.email,
      roleCode: "COLLABORATOR",
    });
    await ensureContractPartyRole(tx, organizationId, businessPartyId, "COLLABORATOR", actorUserId);
    return businessPartyId;
  }

  const party = await tx.enterpriseBusinessParty.findFirst({
    where: { id: selectionId, organizationId, status: "ACTIVE", archivedAt: null },
    select: { id: true },
  });
  if (!party) throw new EnterpriseDomainError("BUSINESS_PARTY_NOT_FOUND", 404);
  return party.id;
}

export async function createEnterpriseContract(organizationId: string, actorUserId: string, input: ContractCreateInput) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const businessPartyId = await resolveContractBusinessParty(tx, organizationId, actorUserId, input.businessPartyId);
    if (input.approverUserId === actorUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);

    const status = input.approverUserId ? "PENDING_APPROVAL" : "DRAFT";
    const contract = await tx.enterpriseContract.create({
      data: {
        organizationId,
        reference: enterpriseReference("CTR"),
        businessPartyId,
        opportunityId: input.opportunityId || null,
        quoteId: input.quoteId || null,
        contractType: input.contractType,
        title: input.title,
        description: input.description || null,
        status,
        ownerUserId: input.ownerUserId || actorUserId,
        departmentId: input.departmentId || null,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
        indicativeAmount: input.indicativeAmount ?? null,
        currency: input.currency || null,
        renewalMode: input.renewalMode,
        renewalNoticeDays: input.renewalNoticeDays ?? null,
        terms: input.terms || null,
        createdByUserId: actorUserId,
      },
    });

    if (input.approverUserId) {
      await tx.enterpriseApproval.create({
        data: {
          organizationId,
          targetEntityType: "EnterpriseContract",
          targetEntityId: contract.id,
          requestedByUserId: actorUserId,
          approverUserId: input.approverUserId,
        },
      });
    }
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseContract",
      entityId: contract.id,
      eventType: input.approverUserId ? "CONTRACT_SUBMITTED" : "CONTRACT_CREATED",
      summary: `Contrat ${contract.reference} créé`,
      actorUserId,
      toStatus: status,
    });
    return contract;
  });
}

export async function updateEnterpriseContract(
  organizationId: string,
  contractId: string,
  actorUserId: string,
  input: ContractUpdateInput,
) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.enterpriseContract.findFirst({ where: { id: contractId, organizationId, archivedAt: null } });
    if (!contract) throw new EnterpriseDomainError("CONTRACT_NOT_FOUND", 404);
    if (contract.revision !== input.revision) throw new EnterpriseDomainConflictError();
    if (contract.status !== "DRAFT") throw new EnterpriseDomainError("CONTRACT_EDIT_STATUS_INVALID", 409);
    const businessPartyId = input.businessPartyId
      ? await resolveContractBusinessParty(tx, organizationId, actorUserId, input.businessPartyId)
      : undefined;
    const updated = await tx.enterpriseContract.updateMany({
      where: { id: contractId, organizationId, revision: input.revision, status: "DRAFT", archivedAt: null },
      data: {
        ...(businessPartyId !== undefined ? { businessPartyId } : {}),
        ...(input.opportunityId !== undefined ? { opportunityId: input.opportunityId || null } : {}),
        ...(input.quoteId !== undefined ? { quoteId: input.quoteId || null } : {}),
        ...(input.contractType !== undefined ? { contractType: input.contractType } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId || null } : {}),
        ...(input.departmentId !== undefined ? { departmentId: input.departmentId || null } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate || null } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate || null } : {}),
        ...(input.indicativeAmount !== undefined ? { indicativeAmount: input.indicativeAmount ?? null } : {}),
        ...(input.currency !== undefined ? { currency: input.currency || null } : {}),
        ...(input.renewalMode !== undefined ? { renewalMode: input.renewalMode } : {}),
        ...(input.renewalNoticeDays !== undefined ? { renewalNoticeDays: input.renewalNoticeDays ?? null } : {}),
        ...(input.terms !== undefined ? { terms: input.terms || null } : {}),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseContract", entityId: contractId, eventType: "CONTRACT_UPDATED", summary: `Contrat ${contract.reference} modifié`, actorUserId, fromStatus: contract.status, toStatus: contract.status });
    return tx.enterpriseContract.findUniqueOrThrow({ where: { id: contractId } });
  });
}

export async function transitionEnterpriseContract(
  organizationId: string,
  contractId: string,
  actorUserId: string,
  input: ContractTransitionInput,
) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.enterpriseContract.findFirst({
      where: { id: contractId, organizationId, archivedAt: null },
    });
    if (!contract) throw new EnterpriseDomainError("CONTRACT_NOT_FOUND", 404);
    if (contract.revision !== input.revision) throw new EnterpriseDomainConflictError();

    let targetStatus = contract.status;
    const data: Prisma.EnterpriseContractUpdateManyMutationInput = { updatedByUserId: actorUserId, revision: { increment: 1 } };
    let approvalId: string | null = null;

    if (input.action === "SUBMIT") {
      if (contract.status !== "DRAFT" || !input.approverUserId) throw new EnterpriseDomainError("CONTRACT_SUBMISSION_INVALID", 409);
      if (input.approverUserId === actorUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);
      const approver = await tx.organizationMember.findFirst({
        where: { organizationId, userId: input.approverUserId, status: "ACTIVE", removedAt: null },
        select: { id: true },
      });
      if (!approver) throw new EnterpriseDomainError("CONTRACT_APPROVER_NOT_MEMBER", 404);
      const approval = await tx.enterpriseApproval.create({
        data: {
          organizationId,
          targetEntityType: "EnterpriseContract",
          targetEntityId: contract.id,
          requestedByUserId: actorUserId,
          approverUserId: input.approverUserId,
        },
      });
      approvalId = approval.id;
      targetStatus = "PENDING_APPROVAL";
    } else if (input.action === "APPROVE" || input.action === "REJECT") {
      if (contract.status !== "PENDING_APPROVAL") throw new EnterpriseDomainError("CONTRACT_DECISION_INVALID", 409);
      const approval = await tx.enterpriseApproval.findFirst({
        where: {
          organizationId,
          targetEntityType: "EnterpriseContract",
          targetEntityId: contract.id,
          status: "PENDING",
          archivedAt: null,
        },
        orderBy: { requestedAt: "desc" },
      });
      if (!approval) throw new EnterpriseDomainError("CONTRACT_APPROVAL_NOT_FOUND", 404);
      if (approval.approverUserId !== actorUserId) throw new EnterpriseDomainError("CONTRACT_APPROVER_REQUIRED", 403);
      await tx.enterpriseApproval.updateMany({
        where: { id: approval.id, organizationId, status: "PENDING", revision: approval.revision },
        data: {
          status: input.action === "APPROVE" ? "APPROVED" : "REJECTED",
          decidedAt: new Date(),
          decisionComment: input.reason || null,
          revision: { increment: 1 },
        },
      });
      approvalId = approval.id;
      targetStatus = input.action === "APPROVE" ? "APPROVED" : "DRAFT";
      if (input.action === "APPROVE") data.approvedAt = new Date();
    } else if (input.action === "ACTIVATE") {
      if (!(["APPROVED", "SUSPENDED"] as string[]).includes(contract.status)) throw new EnterpriseDomainError("CONTRACT_ACTIVATION_INVALID", 409);
      targetStatus = "ACTIVE";
      data.activatedAt = contract.activatedAt || new Date();
    } else if (input.action === "SUSPEND") {
      if (contract.status !== "ACTIVE" || !input.reason) throw new EnterpriseDomainError("CONTRACT_SUSPENSION_INVALID", 409);
      targetStatus = "SUSPENDED";
      data.suspendedAt = new Date();
    } else if (input.action === "RENEW") {
      if (!(["ACTIVE", "SUSPENDED", "EXPIRED"] as string[]).includes(contract.status) || !input.renewedEndDate) {
        throw new EnterpriseDomainError("CONTRACT_RENEWAL_INVALID", 409);
      }
      if (contract.endDate && input.renewedEndDate <= contract.endDate) throw new EnterpriseDomainError("CONTRACT_RENEWAL_DATE_INVALID", 409);
      targetStatus = "ACTIVE";
      data.endDate = input.renewedEndDate;
      data.activatedAt = contract.activatedAt || new Date();
    } else if (input.action === "TERMINATE") {
      if (!(["ACTIVE", "SUSPENDED"] as string[]).includes(contract.status) || !input.reason) throw new EnterpriseDomainError("CONTRACT_TERMINATION_INVALID", 409);
      targetStatus = "TERMINATED";
      data.terminatedAt = new Date();
      data.terminationReason = input.reason;
    } else if (input.action === "ARCHIVE") {
      if (!(["TERMINATED", "CANCELLED", "EXPIRED"] as string[]).includes(contract.status)) throw new EnterpriseDomainError("CONTRACT_ARCHIVE_INVALID", 409);
      data.archivedAt = new Date();
    }

    data.status = targetStatus;
    const updated = await tx.enterpriseContract.updateMany({
      where: { id: contract.id, organizationId, revision: input.revision, status: contract.status, archivedAt: null },
      data,
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();

    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseContract",
      entityId: contract.id,
      eventType: `CONTRACT_${input.action}`,
      summary: `Contrat ${contract.reference}: ${input.action}`,
      actorUserId,
      fromStatus: contract.status,
      toStatus: targetStatus,
      metadataJson: { approvalId, reasonProvided: Boolean(input.reason) },
    });
    return tx.enterpriseContract.findUniqueOrThrow({ where: { id: contract.id } });
  });
}
