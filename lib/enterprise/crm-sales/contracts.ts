import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import {
  assertActiveClientOrganization,
  enterpriseReference,
  publishEnterpriseEvent,
} from "@/lib/enterprise/crm-sales/helpers";
import type { contractCreateSchema, contractTransitionSchema, contractUpdateSchema } from "@/lib/enterprise/crm-sales/schemas";
import { prisma } from "@/lib/prisma";

type ContractCreateInput = z.infer<typeof contractCreateSchema>;
type ContractTransitionInput = z.infer<typeof contractTransitionSchema>;
type ContractUpdateInput = z.infer<typeof contractUpdateSchema>;

export async function createEnterpriseContract(organizationId: string, actorUserId: string, input: ContractCreateInput) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const party = await tx.enterpriseBusinessParty.findFirst({
      where: { id: input.businessPartyId, organizationId, archivedAt: null },
      select: { id: true },
    });
    if (!party) throw new EnterpriseDomainError("BUSINESS_PARTY_NOT_FOUND", 404);
    if (input.approverUserId === actorUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);

    const status = input.approverUserId ? "PENDING_APPROVAL" : "DRAFT";
    const contract = await tx.enterpriseContract.create({
      data: {
        organizationId,
        reference: enterpriseReference("CTR"),
        businessPartyId: input.businessPartyId,
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
    if (input.businessPartyId) {
      const party = await tx.enterpriseBusinessParty.findFirst({ where: { id: input.businessPartyId, organizationId, archivedAt: null }, select: { id: true } });
      if (!party) throw new EnterpriseDomainError("BUSINESS_PARTY_NOT_FOUND", 404);
    }
    const updated = await tx.enterpriseContract.updateMany({
      where: { id: contractId, organizationId, revision: input.revision, status: "DRAFT", archivedAt: null },
      data: {
        ...(input.businessPartyId !== undefined ? { businessPartyId: input.businessPartyId } : {}),
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
