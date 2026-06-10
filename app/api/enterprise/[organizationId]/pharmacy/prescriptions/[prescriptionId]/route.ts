import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import {
  canAccessPharmacyPrescriptions,
  type PharmacyPrescriptionAction,
} from "@/lib/pharmacy-prescription-access";
import { prescriptionActionSchema } from "@/lib/pharmacy-prescription-validators";
import { createSaleFromPrescription } from "@/lib/pharmacy-prescriptions";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; prescriptionId: string }> };
type Transaction = Prisma.TransactionClient;

async function addEvent(
  transaction: Transaction,
  organizationId: string,
  prescriptionId: string,
  actorId: string,
  action: string,
  notes?: string,
) {
  await transaction.pharmacyPrescriptionAuditEvent.create({
    data: { organizationId, prescriptionId, actorId, action, notes: notes || null },
  });
}

function permissionFor(action: string): PharmacyPrescriptionAction {
  if (action === "validate") return "validate";
  if (action === "reject") return "reject";
  if (action === "substitute-line") return "substitute";
  if (action === "create-sale") return "create_sale";
  if (action === "mark-partially-dispensed" || action === "mark-dispensed") return "mark_dispensed";
  if (action === "archive") return "archive";
  if (action === "submit") return "submit";
  if (action === "match-line" || action === "mark-line-unavailable") return "match_products";
  return "update";
}

export async function GET(request: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, prescriptionId } = await params;
  if (!(await canAccessPharmacyPrescriptions(session.userId, organizationId, "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const prescription = await prisma.pharmacyPrescription.findFirst({
    where: { id: prescriptionId, organizationId },
    include: {
      lines: true,
      documents: true,
      auditEvents: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!prescription) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ prescription });
}

export async function PATCH(request: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(
    getRateLimitKey(request, `pharmacy-prescriptions:${session.userId}`),
    120,
    3600000,
  );
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests", message: "Trop d'actions sur les ordonnances." },
      { status: 429 },
    );
  }
  const { organizationId, prescriptionId } = await params;
  const parsed = prescriptionActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid action", message: parsed.error.issues[0]?.message || "Action invalide." },
      { status: 400 },
    );
  }
  const data = parsed.data;
  if (!(await canAccessPharmacyPrescriptions(session.userId, organizationId, permissionFor(data.action)))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const prescription = await prisma.pharmacyPrescription.findFirst({
    where: { id: prescriptionId, organizationId },
    include: { lines: true },
  });
  if (!prescription) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const reason = data.reason?.trim() || undefined;
  const lineId = data.lineId || undefined;
  const productId = data.productId || undefined;
  const substituteProductId = data.substituteProductId || undefined;

  if (data.action === "reject" && !reason) {
    return NextResponse.json(
      { error: "Reason required", message: "Le motif de rejet est obligatoire." },
      { status: 400 },
    );
  }
  if (["match-line", "substitute-line", "mark-line-unavailable"].includes(data.action) && !lineId) {
    return NextResponse.json(
      { error: "Line required", message: "Sélectionnez une ligne de prescription." },
      { status: 400 },
    );
  }

  try {
    let saleId: string | undefined;
    if (data.action === "create-sale") {
      const sale = await createSaleFromPrescription(organizationId, prescriptionId, session.userId);
      saleId = sale.id;
    } else {
      await prisma.$transaction(async (transaction) => {
        if (data.action === "submit") {
          await transaction.pharmacyPrescription.update({
            where: { id: prescriptionId },
            data: { status: "IN_VALIDATION", validationStatus: "PENDING", updatedById: session.userId },
          });
        } else if (data.action === "validate") {
          await transaction.pharmacyPrescription.update({
            where: { id: prescriptionId },
            data: {
              status: "VALIDATED",
              validationStatus: "VALIDATED",
              pharmacistId: session.userId,
              pharmacistComment: reason || null,
              pharmacistValidatedAt: new Date(),
              rejectionReason: null,
              updatedById: session.userId,
            },
          });
        } else if (data.action === "reject") {
          await transaction.pharmacyPrescription.update({
            where: { id: prescriptionId },
            data: {
              status: "REJECTED",
              validationStatus: "REJECTED",
              pharmacistId: session.userId,
              rejectionReason: reason,
              updatedById: session.userId,
            },
          });
        } else if (data.action === "request-info") {
          await transaction.pharmacyPrescription.update({
            where: { id: prescriptionId },
            data: {
              status: "IN_VALIDATION",
              validationStatus: "MISSING_INFORMATION",
              pharmacistId: session.userId,
              pharmacistComment: reason || "Information complémentaire demandée.",
              updatedById: session.userId,
            },
          });
        } else if (data.action === "match-line") {
          const selectedLineId = lineId;
          const selectedProductId = productId;
          if (!selectedLineId || !selectedProductId) throw new Error("PRODUCT_REQUIRED");
          const [line, product] = await Promise.all([
            transaction.pharmacyPrescriptionLine.findFirst({ where: { id: selectedLineId, prescriptionId, organizationId } }),
            transaction.pharmacyProduct.findFirst({ where: { id: selectedProductId, organizationId, status: "ACTIVE" } }),
          ]);
          if (!line || !product) throw new Error("INVALID_LINE_PRODUCT");
          await transaction.pharmacyPrescriptionLine.update({
            where: { id: line.id },
            data: { matchedProductId: product.id, matchingStatus: "MATCHED" },
          });
        } else if (data.action === "substitute-line") {
          const selectedLineId = lineId;
          const selectedSubstituteProductId = substituteProductId;
          if (!selectedLineId || !selectedSubstituteProductId) throw new Error("PRODUCT_REQUIRED");
          const [line, product] = await Promise.all([
            transaction.pharmacyPrescriptionLine.findFirst({ where: { id: selectedLineId, prescriptionId, organizationId } }),
            transaction.pharmacyProduct.findFirst({ where: { id: selectedSubstituteProductId, organizationId, status: "ACTIVE" } }),
          ]);
          if (!line || !product) throw new Error("INVALID_LINE_PRODUCT");
          if (!line.substitutionAllowed || !product.genericSubstitutionAllowed) {
            throw new Error("SUBSTITUTION_NOT_ALLOWED");
          }
          await transaction.pharmacyPrescriptionLine.update({
            where: { id: line.id },
            data: {
              substituteProductId: product.id,
              substitutionApplied: true,
              substitutionReason: reason || "Substitution générique autorisée.",
              matchingStatus: "SUBSTITUTION_ACCEPTED",
            },
          });
        } else if (data.action === "mark-line-unavailable") {
          const selectedLineId = lineId;
          if (!selectedLineId) throw new Error("INVALID_LINE_PRODUCT");
          const line = await transaction.pharmacyPrescriptionLine.findFirst({
            where: { id: selectedLineId, prescriptionId, organizationId },
          });
          if (!line) throw new Error("INVALID_LINE_PRODUCT");
          await transaction.pharmacyPrescriptionLine.update({
            where: { id: line.id },
            data: { matchingStatus: "UNAVAILABLE", dispensingStatus: "UNAVAILABLE", notes: reason || line.notes },
          });
        } else if (data.action === "mark-partially-dispensed" || data.action === "mark-dispensed") {
          if (prescription.validationStatus !== "VALIDATED") throw new Error("PRESCRIPTION_NOT_VALIDATED");
          const status = data.action === "mark-dispensed" ? "DISPENSED" : "PARTIALLY_DISPENSED";
          await transaction.pharmacyPrescription.update({
            where: { id: prescriptionId },
            data: { status, updatedById: session.userId },
          });
        } else if (data.action === "archive") {
          await transaction.pharmacyPrescription.update({
            where: { id: prescriptionId },
            data: { status: "ARCHIVED", updatedById: session.userId },
          });
        }
        await addEvent(
          transaction,
          organizationId,
          prescriptionId,
          session.userId,
          data.action.toUpperCase().replaceAll("-", "_"),
          reason,
        );
      });
    }
    await writeAuditLog({
      userId: session.userId,
      action: `PHARMACY_PRESCRIPTION_${data.action.toUpperCase().replaceAll("-", "_")}`,
      entity: "PharmacyPrescription",
      entityId: prescriptionId,
      request,
      metadata: { organizationId, lineId: lineId || null, productId: productId || substituteProductId || null, saleId: saleId || null },
    });
    await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, saleId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const messages: Record<string, string> = {
      PRODUCT_REQUIRED: "Sélectionnez un produit.",
      INVALID_LINE_PRODUCT: "La ligne ou le produit n'appartient pas à cette pharmacie.",
      SUBSTITUTION_NOT_ALLOWED: "La substitution générique n'est pas autorisée pour cette ligne ou ce produit.",
      PRESCRIPTION_NOT_VALIDATED: "L'ordonnance doit être validée avant cette action.",
      PRESCRIPTION_SALE_EXISTS: "Une vente active est déjà liée à cette ordonnance.",
      NO_MATCHED_LINES: "Aucune ligne rapprochée ne peut générer une vente.",
      NO_SELLABLE_PRODUCTS: "Aucun produit rapproché ne dispose d'un lot vendable.",
    };
    return NextResponse.json(
      { error: code, message: messages[code] || "L'action sur l'ordonnance a échoué." },
      { status: 400 },
    );
  }
}
