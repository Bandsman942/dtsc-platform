import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { mobileMoneyFxReadScope } from "@/lib/enterprise/retail/mobile-money-fx-history";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { retailAccountingPendingDiagnostic } from "@/lib/enterprise/retail/accounting-pending-diagnostic";
import { authorizeRetailRequest } from "@/lib/enterprise/retail/http";
import { finalizeMobileMoneyFxAccounting } from "@/lib/enterprise/retail/mobile-money-accounting";
import { retailPendingOutcome, retailSuccessOutcome } from "@/lib/enterprise/retail/mutation-outcome";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; transferId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, transferId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "MOBILE_MONEY_AGENCY", "manage", { mutation: true, limit: 100 });
  if (!auth.ok) return auth.response;

  // The route-level manage grant is not a grant to every shop's wallets.
  // Resolve the permitted transfer before entering the posting/retry handler.
  const transfer = await prisma.$transaction(async tx => {
    const scope = await mobileMoneyFxReadScope(tx, organizationId, auth.session.userId, "COLLECT_PAYMENT");
    return tx.enterpriseMobileMoneyFxTransfer.findFirst({
      where: { ...scope, id: transferId, organizationId },
      select: {
        id: true,
        number: true,
        providerCode: true,
        sourceCurrencyCode: true,
        targetCurrencyCode: true,
        status: true,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  if (!transfer) {
    return NextResponse.json(
      { ok: false, outcome: "FAILURE", message: "Conversion Mobile Money introuvable dans cette entreprise." },
      { status: 404 },
    );
  }
  if (!new Set(["CONFIRMED", "REVERSED"]).has(transfer.status)) {
    return NextResponse.json(
      { ok: false, outcome: "FAILURE", message: "Cette conversion n’est pas dans un état compatible avec la finalisation comptable." },
      { status: 409 },
    );
  }

  try {
    const accounting = await finalizeMobileMoneyFxAccounting(organizationId, auth.session.userId, transfer.id);
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
    const diagnostic = retailAccountingPendingDiagnostic(error);
    await Promise.allSettled([
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
