import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  canAccessPharmacySales,
  type PharmacySaleAction,
} from "@/lib/pharmacy-sale-access";
import { saleActionSchema } from "@/lib/pharmacy-sale-validators";
import {
  applySaleStockImpact,
  reverseSaleStockImpact,
} from "@/lib/pharmacy-sales";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = {
  params: Promise<{ organizationId: string; saleId: string }>;
};

export async function GET(req: Request, { params }: Params) {
  void req;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { organizationId, saleId } = await params;
  if (!(await canAccessPharmacySales(session.userId, organizationId, "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sale = await prisma.pharmacySale.findFirst({
    where: { id: saleId, organizationId },
    include: { lines: true, refunds: { include: { lines: true } }, anomalies: true },
  });
  if (!sale) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const movements = await prisma.pharmacyStockMovement.findMany({
    where: { organizationId, relatedEntityType: "PharmacySale", relatedEntityId: saleId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ sale, movements });
}

export async function PATCH(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = await rateLimit(
    getRateLimitKey(req, `pharmacy-sales:${session.userId}`),
    120,
    3600000,
  );
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { organizationId, saleId } = await params;
  const parsed = saleActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid action", message: "Action de vente invalide." },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const permission: PharmacySaleAction =
    data.action === "pay"
      ? "pay"
      : data.action === "cancel"
        ? "cancel"
        : data.action === "refund"
          ? "refund"
          : data.action.startsWith("pharmacist-")
            ? "pharmacist_validate"
            : "confirm";
  if (!(await canAccessPharmacySales(session.userId, organizationId, permission))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sale = await prisma.pharmacySale.findFirst({
    where: { id: saleId, organizationId },
    include: { lines: true },
  });
  if (!sale) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (data.action === "request-validation") {
    await prisma.pharmacySale.update({
      where: { id: saleId },
      data: {
        status: "PHARMACIST_VALIDATION",
        validationRequired: true,
        pharmacistValidationStatus: "PENDING",
        updatedById: session.userId,
      },
    });
  } else if (data.action === "pharmacist-validate") {
    await prisma.pharmacySale.update({
      where: { id: saleId },
      data: {
        pharmacistId: session.userId,
        pharmacistValidationStatus: "VALIDATED",
        pharmacistValidationComment: data.reason || null,
        pharmacistValidatedAt: new Date(),
        status: "VALIDATED",
        updatedById: session.userId,
      },
    });
  } else if (data.action === "pharmacist-reject") {
    await prisma.pharmacySale.update({
      where: { id: saleId },
      data: {
        pharmacistId: session.userId,
        pharmacistValidationStatus: "REJECTED",
        pharmacistRejectionReason: data.reason || "Rejeté",
        status: "REJECTED",
        updatedById: session.userId,
      },
    });
  } else if (data.action === "pay") {
    return NextResponse.json(
      { error: "Cash payment required", message: "Enregistrez le paiement dans le module Caisse, factures & paiements." },
      { status: 400 },
    );
  } else if (data.action === "confirm") {
    await applySaleStockImpact(organizationId, saleId, session.userId);
  } else if (data.action === "cancel") {
    const cancellationReason = data.reason;
    if (!cancellationReason) {
      return NextResponse.json(
        { error: "Reason required", message: "Le motif d'annulation est obligatoire." },
        { status: 400 },
      );
    }
    await reverseSaleStockImpact(organizationId, saleId, session.userId, cancellationReason);
  } else if (data.action === "refund") {
    const refundReason = data.reason;
    const refundAmount = data.refundAmount;
    if (!refundReason || refundAmount === undefined) {
      return NextResponse.json(
        { error: "Invalid refund", message: "Motif et montant obligatoires." },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      const refund = await tx.pharmacySaleRefund.create({
        data: {
          organizationId,
          saleId,
          refundType: data.restockItems ? "RETURN_RESTOCK" : "REFUND_ONLY",
          refundAmount,
          restockItems: data.restockItems || false,
          reason: refundReason,
          validatedById: session.userId,
          createdById: session.userId,
        },
      });

      if (data.restockItems) {
        for (const line of sale.lines) {
          const batch = await tx.pharmacyBatch.findFirst({
            where: { id: line.batchId, organizationId },
          });
          if (!batch) continue;

          const before = Number(batch.availableQuantity);
          const quantity = Number(line.quantity);
          await tx.pharmacyBatch.update({
            where: { id: batch.id },
            data: { availableQuantity: before + quantity, updatedById: session.userId },
          });
          await tx.pharmacyStockMovement.create({
            data: {
              organizationId,
              productId: line.productId,
              batchId: line.batchId,
              movementType: "RETURN_CUSTOMER",
              direction: "IN",
              quantity,
              quantityBefore: before,
              quantityAfter: before + quantity,
              reason: refundReason,
              relatedEntityType: "PharmacySaleRefund",
              relatedEntityId: refund.id,
              createdById: session.userId,
            },
          });
          await tx.pharmacySaleRefundLine.create({
            data: {
              organizationId,
              refundId: refund.id,
              saleLineId: line.id,
              productId: line.productId,
              batchId: line.batchId,
              quantityReturned: quantity,
              restocked: true,
            },
          });
        }
      }

      await tx.pharmacySale.update({
        where: { id: saleId },
        data: {
          status: "REFUNDED",
          refundedAmount: Number(sale.refundedAmount || 0) + refundAmount,
          updatedById: session.userId,
        },
      });
    });
  }

  await writeAuditLog({
    userId: session.userId,
    action: `PHARMACY_SALE_${data.action.toUpperCase().replaceAll("-", "_")}`,
    entity: "PharmacySale",
    entityId: saleId,
    request: req,
    metadata: { organizationId, reason: data.reason || null },
  });
  return NextResponse.json({ ok: true });
}
