import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { effectivePharmacyBatchStatus } from "@/lib/pharmacy-batches";
import type { pharmacyPrescriptionSchema } from "@/lib/pharmacy-prescription-validators";
import { prisma } from "@/lib/prisma";

type PrescriptionInput = z.infer<typeof pharmacyPrescriptionSchema>;
type PreparedSaleLine = {
  line: {
    id: string;
    prescribedQuantity: unknown;
  };
  product: {
    id: string;
    referenceSalePrice: unknown;
    saleUnit: string;
    prescriptionRequired: boolean;
  };
  batch: {
    id: string;
    salePrice: unknown;
  };
  quantity: number;
};
const nil = <T>(value: T | "" | undefined) => value === "" || value === undefined ? null : value;

export async function validatePrescriptionReferences(organizationId: string, data: PrescriptionInput) {
  const productIds = data.lines.flatMap((line) => line.productId ? [line.productId] : []);
  const [products, pharmacist] = await Promise.all([
    prisma.pharmacyProduct.findMany({ where: { organizationId, id: { in: productIds }, status: "ACTIVE" }, select: { id: true } }),
    data.pharmacistId
      ? prisma.organizationMember.findFirst({ where: { organizationId, userId: data.pharmacistId, status: "ACTIVE", removedAt: null }, select: { id: true } })
      : null,
  ]);
  if (products.length !== new Set(productIds).size) return "Un produit sélectionné n'appartient pas à cette pharmacie.";
  if (data.pharmacistId && !pharmacist) return "Le pharmacien sélectionné n'appartient pas à cette pharmacie.";
  return null;
}

async function addPrescriptionEvent(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  prescriptionId: string,
  actorId: string,
  action: string,
  notes?: string | null,
) {
  await transaction.pharmacyPrescriptionAuditEvent.create({
    data: { organizationId, prescriptionId, actorId, action, notes: notes || null },
  });
}

export async function createPharmacyPrescription(organizationId: string, userId: string, data: PrescriptionInput) {
  const count = await prisma.pharmacyPrescription.count({ where: { organizationId } });
  const prescriptionNumber = data.prescriptionNumber || `ORD-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;
  return prisma.$transaction(async (transaction) => {
    const prescription = await transaction.pharmacyPrescription.create({
      data: {
        organizationId,
        prescriptionNumber,
        prescriptionType: data.prescriptionType,
        prescriptionDate: data.prescriptionDate,
        receivedAt: data.receivedAt,
        priority: data.priority,
        patientName: data.patientName,
        patientAge: data.patientAge === "" || data.patientAge === undefined ? null : Number(data.patientAge),
        patientSex: nil(data.patientSex),
        patientPhone: nil(data.patientPhone),
        patientAddress: nil(data.patientAddress),
        patientType: nil(data.patientType),
        patientNotes: nil(data.patientNotes),
        prescriberName: data.prescriberName,
        prescriberType: nil(data.prescriberType),
        prescriberIdentifier: nil(data.prescriberIdentifier),
        prescriberPhone: nil(data.prescriberPhone),
        prescriberFacility: nil(data.prescriberFacility),
        prescriberSpeciality: nil(data.prescriberSpeciality),
        prescriberAddress: nil(data.prescriberAddress),
        pharmacistId: nil(data.pharmacistId),
        notes: nil(data.notes),
        createdById: userId,
        updatedById: userId,
      },
    });
    await transaction.pharmacyPrescriptionLine.createMany({
      data: data.lines.map((line) => ({
        organizationId,
        prescriptionId: prescription.id,
        prescribedProductText: line.prescribedProductText,
        prescribedGenericName: nil(line.prescribedGenericName),
        productId: nil(line.productId),
        matchedProductId: nil(line.productId),
        dosage: nil(line.dosage),
        pharmaceuticalForm: nil(line.pharmaceuticalForm),
        prescribedQuantity: line.prescribedQuantity === "" || line.prescribedQuantity === undefined ? null : Number(line.prescribedQuantity),
        prescribedUnit: nil(line.prescribedUnit),
        frequency: nil(line.frequency),
        duration: nil(line.duration),
        administrationRoute: nil(line.administrationRoute),
        posology: nil(line.posology),
        substitutionAllowed: line.substitutionAllowed,
        matchingStatus: line.productId ? "MATCHED" : "UNMATCHED",
        notes: nil(line.notes),
      })),
    });
    await addPrescriptionEvent(transaction, organizationId, prescription.id, userId, "CREATED");
    return prescription;
  });
}

export async function getPharmacyPrescriptionsDataset(organizationId: string) {
  const [prescriptions, products, batches, members, sales] = await Promise.all([
    prisma.pharmacyPrescription.findMany({
      where: { organizationId },
      orderBy: { receivedAt: "desc" },
      include: { lines: true, documents: true, auditEvents: { orderBy: { createdAt: "desc" }, take: 20 } },
    }),
    prisma.pharmacyProduct.findMany({ where: { organizationId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.pharmacyBatch.findMany({ where: { organizationId, availableQuantity: { gt: 0 } }, orderBy: { expiryDate: "asc" } }),
    prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", removedAt: null }, select: { user: { select: { id: true, name: true } } } }),
    prisma.pharmacySale.findMany({ where: { organizationId }, select: { id: true, saleNumber: true, prescriptionId: true, status: true } }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const metrics = {
    receivedToday: prescriptions.filter((item) => item.receivedAt.toISOString().slice(0, 10) === today).length,
    receivedMonth: prescriptions.filter((item) => item.receivedAt >= monthStart).length,
    pendingValidation: prescriptions.filter((item) => ["PENDING", "MISSING_INFORMATION"].includes(item.validationStatus)).length,
    validated: prescriptions.filter((item) => item.validationStatus === "VALIDATED").length,
    partial: prescriptions.filter((item) => item.status === "PARTIALLY_DISPENSED").length,
    dispensed: prescriptions.filter((item) => item.status === "DISPENSED").length,
    rejected: prescriptions.filter((item) => item.status === "REJECTED").length,
    withDocument: prescriptions.filter((item) => item.documents.length > 0 || item.mainDocumentUrl).length,
    withoutDocument: prescriptions.filter((item) => item.documents.length === 0 && !item.mainDocumentUrl).length,
    linkedSale: prescriptions.filter((item) => item.linkedSaleId).length,
    unmatchedLines: prescriptions.flatMap((item) => item.lines).filter((line) => line.matchingStatus === "UNMATCHED").length,
    undispensedLines: prescriptions.flatMap((item) => item.lines).filter((line) => line.dispensingStatus === "NOT_DISPENSED").length,
  };
  return {
    metrics,
    prescriptions,
    products,
    batches: batches.filter((batch) => ["ACTIVE", "NEAR_EXPIRY"].includes(effectivePharmacyBatchStatus(batch))),
    members: members.map((item) => item.user),
    sales,
  };
}

export async function createSaleFromPrescription(organizationId: string, prescriptionId: string, userId: string) {
  return prisma.$transaction(async (transaction) => {
    const prescription = await transaction.pharmacyPrescription.findFirst({
      where: { id: prescriptionId, organizationId },
      include: { lines: true },
    });
    if (!prescription) throw new Error("PRESCRIPTION_NOT_FOUND");
    if (prescription.validationStatus !== "VALIDATED" || prescription.status === "REJECTED") throw new Error("PRESCRIPTION_NOT_VALIDATED");
    const existingSale = await transaction.pharmacySale.findFirst({ where: { organizationId, prescriptionId, status: { notIn: ["CANCELLED", "REJECTED"] } } });
    if (existingSale) throw new Error("PRESCRIPTION_SALE_EXISTS");
    const matchedLines = prescription.lines.filter((line) => line.matchingStatus !== "UNAVAILABLE" && (line.substituteProductId || line.matchedProductId || line.productId));
    if (!matchedLines.length) throw new Error("NO_MATCHED_LINES");
    const preparedLines: PreparedSaleLine[] = [];
    for (const line of matchedLines) {
      const productId = line.substituteProductId || line.matchedProductId || line.productId;
      if (!productId) continue;
      const batchCandidates = await transaction.pharmacyBatch.findMany({ where: { organizationId, productId, availableQuantity: { gt: 0 } }, orderBy: { expiryDate: "asc" } });
      const batch = batchCandidates.find((item) => ["ACTIVE", "NEAR_EXPIRY"].includes(effectivePharmacyBatchStatus(item)));
      const product = await transaction.pharmacyProduct.findFirst({ where: { id: productId, organizationId, status: "ACTIVE" } });
      if (!batch || !product) continue;
      const quantity = Math.min(Number(line.prescribedQuantity || 1), Number(batch.availableQuantity));
      preparedLines.push({ line, product, batch, quantity });
    }
    if (!preparedLines.length) throw new Error("NO_SELLABLE_PRODUCTS");
    const count = await transaction.pharmacySale.count({ where: { organizationId } });
    const sale = await transaction.pharmacySale.create({
      data: {
        organizationId,
        saleNumber: `VTE-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`,
        saleType: "PRESCRIPTION",
        customerName: prescription.patientName,
        customerPhone: prescription.patientPhone,
        customerType: prescription.patientType,
        prescriptionId: prescription.id,
        prescriberName: prescription.prescriberName,
        cashierId: userId,
        saleDate: new Date(),
        subtotal: 0,
        totalAmount: 0,
        paidAmount: 0,
        remainingAmount: 0,
        validationRequired: true,
        pharmacistValidationStatus: "PENDING",
        status: "DRAFT",
        stockImpactApplied: false,
        notes: `Vente générée depuis ${prescription.prescriptionNumber}`,
        createdById: userId,
        updatedById: userId,
      },
    });
    let subtotal = 0;
    for (const item of preparedLines) {
      const unitPrice = Number(item.product.referenceSalePrice || item.batch.salePrice || 0);
      const totalLine = item.quantity * unitPrice;
      subtotal += totalLine;
      await transaction.pharmacySaleLine.create({
        data: {
          organizationId,
          saleId: sale.id,
          productId: item.product.id,
          batchId: item.batch.id,
          quantity: item.quantity,
          unit: item.product.saleUnit,
          unitPrice,
          totalLine,
          lineStatus: "DRAFT",
          requiresPrescription: item.product.prescriptionRequired,
          requiresPharmacistValidation: true,
        },
      });
    }
    await transaction.pharmacySale.update({ where: { id: sale.id }, data: { subtotal, totalAmount: subtotal, remainingAmount: subtotal } });
    await transaction.pharmacyPrescription.update({ where: { id: prescription.id }, data: { linkedSaleId: sale.id, updatedById: userId } });
    await addPrescriptionEvent(transaction, organizationId, prescription.id, userId, "SALE_CREATED", sale.id);
    return sale;
  });
}
