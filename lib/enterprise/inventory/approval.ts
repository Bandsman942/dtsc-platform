import { assertEnterpriseApprovalCandidate, assertEnterpriseApprovalDecision } from "@/lib/enterprise/approval-assignment";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";

function normalizeApprovalError(error: unknown, fallbackCode: string) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : fallbackCode;
  const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 403;
  const message = error instanceof Error ? error.message : "Le validateur sélectionné n’est pas autorisé pour cette opération de stock.";
  return new EnterpriseDomainError(code, Number.isFinite(status) ? status : 403, message);
}

export async function assertInventoryApprovalCandidate(args: {
  organizationId: string;
  requesterUserId: string;
  approverUserId: string;
}) {
  try {
    return await assertEnterpriseApprovalCandidate({
      ...args,
      moduleCode: "INVENTORY_LOGISTICS",
    });
  } catch (error) {
    throw normalizeApprovalError(error, "APPROVER_NOT_ELIGIBLE");
  }
}

export async function assertInventoryApprovalDecision(args: {
  organizationId: string;
  requesterUserId: string;
  approverUserId: string;
  actorUserId: string;
}) {
  try {
    return await assertEnterpriseApprovalDecision({
      ...args,
      moduleCode: "INVENTORY_LOGISTICS",
    });
  } catch (error) {
    throw normalizeApprovalError(error, "APPROVAL_DECISION_DENIED");
  }
}
