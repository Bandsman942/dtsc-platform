import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  assertEnterpriseApprovalCandidate,
  assertEnterpriseApprovalDecision,
} from "@/lib/enterprise/approval-assignment";
import type { EnterpriseFinanceModuleCode } from "@/lib/enterprise/accounting/constants";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

export const ACCOUNTING_APPROVAL_MODULE_BY_TARGET: Readonly<Record<string, EnterpriseFinanceModuleCode>> = {
  EnterpriseJournalEntry: "FINANCE_ACCOUNTING",
  EnterprisePayment: "FINANCE_PAYMENTS",
  EnterpriseSalesInvoice: "FINANCE_RECEIVABLES",
  EnterpriseSupplierInvoiceReview: "FINANCE_PAYABLES",
  EnterpriseSupplierInvoiceApproval: "FINANCE_PAYABLES",
  EnterpriseFinancialClose: "FINANCE_CLOSE",
  EnterpriseCashSession: "FINANCE_CASH",
  EnterpriseReconciliationSession: "FINANCE_RECONCILIATION",
  EnterpriseOpeningBalanceApproval: "FINANCE_ACCOUNTING",
  EnterpriseSalesCreditNoteApproval: "FINANCE_RECEIVABLES",
  EnterpriseSupplierCreditNoteApproval: "FINANCE_PAYABLES",
};

export function accountingApprovalModuleForTarget(targetEntityType: string) {
  return ACCOUNTING_APPROVAL_MODULE_BY_TARGET[targetEntityType] || null;
}

function mapAssignmentError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "ACCOUNTING_APPROVER_NOT_ELIGIBLE";
  if (code === "APPROVER_NOT_ELIGIBLE") return new EnterpriseAccountingError("ACCOUNTING_APPROVER_NOT_ELIGIBLE", 403);
  if (code === "WRONG_APPROVER" || code === "APPROVER_PERMISSION_DENIED") return new EnterpriseAccountingError("ACCOUNTING_APPROVER_NOT_ALLOWED", 403);
  if (code === "SELF_APPROVAL_FORBIDDEN") return new EnterpriseAccountingError("ACCOUNTING_SELF_APPROVAL_FORBIDDEN", 403);
  return error instanceof Error ? error : new EnterpriseAccountingError("ACCOUNTING_APPROVAL_FAILED", 409);
}

export async function assertAccountingApprovalCandidate(input: {
  organizationId: string;
  targetEntityType: string;
  requesterUserId: string;
  approverUserId: string;
}) {
  const moduleCode = accountingApprovalModuleForTarget(input.targetEntityType);
  if (!moduleCode) throw new EnterpriseAccountingError("ACCOUNTING_APPROVAL_TARGET_UNSUPPORTED", 400);
  try {
    return await assertEnterpriseApprovalCandidate({
      organizationId: input.organizationId,
      requesterUserId: input.requesterUserId,
      approverUserId: input.approverUserId,
      moduleCode,
    });
  } catch (error) {
    throw mapAssignmentError(error);
  }
}

export async function createAccountingApprovalAssignment(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    targetEntityType: string;
    targetEntityId: string;
    requesterUserId: string;
    approverUserId: string;
    initialStatus?: "PENDING" | "QUEUED";
  },
) {
  await assertAccountingApprovalCandidate(input);
  const initialStatus = input.initialStatus || "PENDING";

  const existing = await tx.enterpriseApproval.findFirst({
    where: {
      organizationId: input.organizationId,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      status: { in: ["PENDING", "QUEUED"] },
      archivedAt: null,
    },
    select: { id: true },
  });
  if (existing) throw new EnterpriseAccountingError("ACCOUNTING_APPROVAL_ALREADY_PENDING", 409);

  return tx.enterpriseApproval.create({
    data: {
      organizationId: input.organizationId,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      requestedByUserId: input.requesterUserId,
      approverUserId: input.approverUserId,
      status: initialStatus,
    },
  });
}

export async function activateQueuedAccountingApproval(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; targetEntityType: string; targetEntityId: string },
) {
  const queued = await tx.enterpriseApproval.findFirst({
    where: {
      organizationId: input.organizationId,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      status: "QUEUED",
      archivedAt: null,
    },
    select: { id: true, revision: true },
  });
  if (!queued) throw new EnterpriseAccountingError("ACCOUNTING_QUEUED_APPROVAL_NOT_FOUND", 409);
  const updated = await tx.enterpriseApproval.updateMany({
    where: { id: queued.id, organizationId: input.organizationId, status: "QUEUED", revision: queued.revision, archivedAt: null },
    data: { status: "PENDING", requestedAt: new Date(), revision: { increment: 1 } },
  });
  if (updated.count !== 1) throw new EnterpriseAccountingError("ACCOUNTING_APPROVAL_CONFLICT", 409);
  return queued.id;
}

export async function requireAccountingApprovalDecision(input: {
  organizationId: string;
  targetEntityType: string;
  targetEntityId: string;
  actorUserId: string;
}) {
  const moduleCode = accountingApprovalModuleForTarget(input.targetEntityType);
  if (!moduleCode) throw new EnterpriseAccountingError("ACCOUNTING_APPROVAL_TARGET_UNSUPPORTED", 400);

  const approval = await prisma.enterpriseApproval.findFirst({
    where: {
      organizationId: input.organizationId,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      status: "PENDING",
      archivedAt: null,
    },
    select: {
      id: true,
      requestedByUserId: true,
      approverUserId: true,
      revision: true,
    },
  });
  if (!approval) throw new EnterpriseAccountingError("ACCOUNTING_APPROVAL_NOT_ASSIGNED", 409);

  try {
    const decision = await assertEnterpriseApprovalDecision({
      organizationId: input.organizationId,
      requesterUserId: approval.requestedByUserId,
      approverUserId: approval.approverUserId,
      actorUserId: input.actorUserId,
      moduleCode,
    });
    return { approval, decision, moduleCode };
  } catch (error) {
    throw mapAssignmentError(error);
  }
}

export async function decideAccountingApproval(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    approvalId: string;
    approvalRevision: number;
    actorUserId: string;
    status: "APPROVED" | "REJECTED";
    decisionComment?: string | null;
    selfApprovalOverride?: boolean;
  },
) {
  const updated = await tx.enterpriseApproval.updateMany({
    where: {
      id: input.approvalId,
      organizationId: input.organizationId,
      approverUserId: input.actorUserId,
      status: "PENDING",
      revision: input.approvalRevision,
      archivedAt: null,
    },
    data: {
      status: input.status,
      decidedAt: new Date(),
      decisionComment: input.decisionComment?.trim()
        || (input.selfApprovalOverride ? "SELF_APPROVAL_OVERRIDE" : null),
      revision: { increment: 1 },
    },
  });
  if (updated.count !== 1) throw new EnterpriseAccountingError("ACCOUNTING_APPROVAL_CONFLICT", 409);
}

export async function cancelPendingAccountingApprovals(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; targetEntityTypes: string[]; targetEntityId: string; reason?: string | null },
) {
  await tx.enterpriseApproval.updateMany({
    where: {
      organizationId: input.organizationId,
      targetEntityType: { in: input.targetEntityTypes },
      targetEntityId: input.targetEntityId,
      status: { in: ["PENDING", "QUEUED"] },
      archivedAt: null,
    },
    data: {
      status: "CANCELLED",
      decidedAt: new Date(),
      decisionComment: input.reason?.trim() || "TARGET_CANCELLED",
      revision: { increment: 1 },
    },
  });
}