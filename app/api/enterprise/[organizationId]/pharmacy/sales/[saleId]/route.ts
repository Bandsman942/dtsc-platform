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
    await writeAuditLog({
      userId: session.userId,
      action: "PHARMACY_SALE_REFUND_REDIRECTED_TO_COMMON_FINANCE",
      entity: "PharmacySale",
      entityId: saleId,
      request: req,
      metadata: { organizationId, reason: data.reason || null },
    });
    return NextResponse.json(
      {
        error: "PHARMACY_REFUND_USE_CASH_WORKFLOW",
        message: "Enregistrez le remboursement dans « Caisse, factures & paiements » afin de synchroniser l'avoir, la trésorerie et la comptabilité avant de marquer la vente remboursée.",
      },
      { status: 409 },
    );
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
