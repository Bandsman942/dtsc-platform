import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { recordPostingFailure } from "@/lib/enterprise/accounting/posting-service";
import { mobileMoneyFxReadScope } from "@/lib/enterprise/retail/mobile-money-fx-history";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { retailAccountingPendingDiagnostic } from "@/lib/enterprise/retail/accounting-pending-diagnostic";
import { authorizeRetailRequest } from "@/lib/enterprise/retail/http";
import { finalizeMobileMoneyFxAccountingTx } from "@/lib/enterprise/retail/mobile-money-accounting";
import { retailPendingOutcome, retailSuccessOutcome } from "@/lib/enterprise/retail/mutation-outcome";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; transferId: string }> };
const transferSelect = {
  id: true, number: true, providerCode: true, sourceCurrencyCode: true, targetCurrencyCode: true, status: true,
} as const;
type TransferIdentity = Prisma.EnterpriseMobileMoneyFxTransferGetPayload<{ select: typeof transferSelect }>;

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, transferId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "MOBILE_MONEY_AGENCY", "manage", { mutation: true, limit: 100 });
  if (!auth.ok) return auth.response;

  // Set only after tenant and wallet authorization, so a failed lookup
  // cannot produce a posting diagnostic for a transfer outside the scope.
  let postingTarget: TransferIdentity | undefined;
  try {
    const result = await prisma.$transaction(async tx => {
      const scope = await mobileMoneyFxReadScope(tx, organizationId, auth.session.userId, "COLLECT_PAYMENT");
      const transfer = await tx.enterpriseMobileMoneyFxTransfer.findFirst({
        where: { ...scope, id: transferId, organizationId },
        select: transferSelect,
      });
      if (!transfer) return { status: 404, message: "Conversion Mobile Money introuvable dans cette entreprise." } as const;
      if (transfer.status !== "CONFIRMED" && transfer.status !== "REVERSED") {
        return { status: 409, message: "Cette conversion n’est pas dans un état compatible avec la finalisation comptable." } as const;
      }
      postingTarget = transfer;
      const accounting = await finalizeMobileMoneyFxAccountingTx(tx, organizationId, auth.session.userId, transfer.id);
      return { status: 200, transfer, accounting } as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
    if (result.status !== 200) {
      return NextResponse.json({ ok: false, outcome: "FAILURE", message: result.message }, { status: result.status });
    }
    const { transfer, accounting } = result;
    await Promise.allSettled([
      writeAuditLog({
        userId: auth.session.userId,
        action: "ENTERPRISE_MOBILE_MONEY_FX_ACCOUNTING_FINALIZED",
        entity: "EnterpriseMobileMoneyFxTransfer",
        entityId: transfer.id,
        request: req,
        metadata: {
          organizationId,
          number: transfer.number,
          providerCode: transfer.providerCode,
          sourceCurrencyCode: transfer.sourceCurrencyCode,
          targetCurrencyCode: transfer.targetCurrencyCode,
          journalEntryId: accounting.entry.id,
          idempotent: accounting.idempotent,
        },
      }),
      writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "mobile-money-fx", action: "finalize-accounting", outcome: "SUCCESS" } }),
    ]);
    return NextResponse.json(
      retailSuccessOutcome({
        transferId: transfer.id,
        accounting: { status: "POSTED", journalEntryId: accounting.entry.id, idempotent: accounting.idempotent },
      }),
    );
  } catch (error) {
    const transfer = postingTarget;
    if (!transfer) throw error;
    const diagnostic = retailAccountingPendingDiagnostic(error);
    await Promise.allSettled([
      recordPostingFailure(organizationId, auth.session.userId, {
        postingEvent: "RETAIL_MOBILE_MONEY_FX_POSTED", sourceEntityType: "EnterpriseMobileMoneyFxTransfer", sourceEntityId: transfer.id,
      }, error),
      writeAuditLog({
        userId: auth.session.userId,
        action: "ENTERPRISE_MOBILE_MONEY_FX_ACCOUNTING_STILL_PENDING",
        entity: "EnterpriseMobileMoneyFxTransfer",
        entityId: transfer.id,
        request: req,
        metadata: {
          organizationId,
          number: transfer.number,
          accountingErrorCode: diagnostic.errorCode,
          accountingMessageCode: diagnostic.messageCode,
        },
      }),
      writeApiLog({ request: req, statusCode: 202, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "mobile-money-fx", action: "finalize-accounting", outcome: "PENDING", accountingErrorCode: diagnostic.errorCode } }),
    ]);
    return NextResponse.json(
      retailPendingOutcome(diagnostic.messageCode, {
        transferId: transfer.id,
        accounting: { status: "PENDING", blockerCode: diagnostic.errorCode, actionHref: diagnostic.actionHref },
      }),
      { status: 202 },
    );
  }
}
