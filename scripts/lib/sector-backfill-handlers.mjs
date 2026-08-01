import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { backfillWhere, createBackfillReport, printBackfillReport, safeErrorCode } from "./sector-backfill.mjs";

const prisma = new PrismaClient();
const ref = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const unitCode = (value) => `BF_${value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "UNIT"}`.slice(0, 40);

async function markSync({ organizationId, sector, sourceEntityType, sourceEntityId, targetEntityType, targetEntityId, status, errorCode, manual = false }) {
  const idempotencyKey = `backfill:${sector}:${sourceEntityType}:${sourceEntityId}`;
  await prisma.enterpriseSectorSyncState.upsert({
    where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
    update: { targetEntityType, targetEntityId, status, errorCode, requiresManualAction: manual, lastAttemptAt: new Date(), completedAt: status === "SYNCED" ? new Date() : null },
    create: { organizationId, sector, sourceEntityType, sourceEntityId, targetEntityType, targetEntityId, idempotencyKey, status, errorCode, requiresManualAction: manual, lastAttemptAt: new Date(), completedAt: status === "SYNCED" ? new Date() : null },
  });
}

async function run(name, options, loader, handler) {
  const { report, record } = createBackfillReport(name, options);
  const items = await loader();
  for (const item of items) {
    report.analyzed += 1;
    report.nextCursor = item.id;
    try {
      const outcome = await handler(item, options);
      record(outcome || "mapped", item.id);
    } catch (error) {
      record(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" ? "ambiguous" : "failed", item.id);
      console.error(JSON.stringify({ id: item.id, error: safeErrorCode(error) }));
    }
  }
  printBackfillReport(report);
  return report;
}

export async function backfillPharmacyBusinessParties(options) {
  return run("pharmacy-business-parties", options, () => prisma.pharmacySupplier.findMany({ where: { ...backfillWhere(options), NOT: { id: { in: [] } } }, orderBy: { id: "asc" }, take: options.limit }), async (source) => {
    const existing = await prisma.pharmacySupplierExtension.findFirst({ where: { organizationId: source.organizationId, pharmacySupplierId: source.id } });
    if (existing) return "skipped";
    if (options.dryRun) return "mapped";
    await prisma.$transaction(async (tx) => {
      const migrationKey = `pharmacy-supplier:${source.id}`;
      const party = await tx.enterpriseBusinessParty.create({ data: { organizationId: source.organizationId, partyType: "ORGANIZATION", legalName: source.name, displayName: source.name, normalizedName: normalize(source.name), code: `PHS-${source.supplierCode}`.slice(0, 80), migrationKey, taxIdentifier: source.taxNumber, registrationId: source.legalIdentifier, primaryEmail: source.email, primaryPhone: source.phone, status: source.status === "ACTIVE" ? "ACTIVE" : "INACTIVE", createdByUserId: source.createdById, roles: { create: { organizationId: source.organizationId, roleCode: "SUPPLIER", createdByUserId: source.createdById } } } });
      const supplier = await tx.enterpriseSupplier.create({ data: { organizationId: source.organizationId, legalName: source.name, displayName: source.name, normalizedName: normalize(`pharmacy ${source.supplierCode} ${source.name}`), supplierType: source.supplierType, category: source.category, status: source.status === "ACTIVE" ? "ACTIVE" : "INACTIVE", email: source.email, phone: source.phone, addressLine: source.address, city: source.city, country: source.country, taxIdentifier: source.taxNumber, registrationId: source.legalIdentifier, createdByUserId: source.createdById } });
      await tx.enterpriseSupplierPartyLink.create({ data: { organizationId: source.organizationId, supplierId: supplier.id, businessPartyId: party.id, paymentTerms: source.paymentTerms, averageLeadTimeDays: source.averageDeliveryDays, migrationKey, createdByUserId: source.createdById } });
      await tx.pharmacySupplierExtension.create({ data: { organizationId: source.organizationId, pharmacySupplierId: source.id, businessPartyId: party.id, enterpriseSupplierId: supplier.id, historicalKey: migrationKey, createdByUserId: source.createdById } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const extension = await prisma.pharmacySupplierExtension.findFirstOrThrow({ where: { organizationId: source.organizationId, pharmacySupplierId: source.id } });
    await markSync({ organizationId: source.organizationId, sector: "PHARMACY", sourceEntityType: "PharmacySupplier", sourceEntityId: source.id, targetEntityType: "EnterpriseSupplier", targetEntityId: extension.enterpriseSupplierId, status: "SYNCED" });
    return "mapped";
  });
}

export async function backfillPharmacyCatalogItems(options) {
  return run("pharmacy-catalog-items", options, () => prisma.pharmacyProduct.findMany({ where: backfillWhere(options), orderBy: { id: "asc" }, take: options.limit }), async (source) => {
    const existing = await prisma.pharmacyProductExtension.findFirst({ where: { organizationId: source.organizationId, pharmacyProductId: source.id } });
    if (existing) return "skipped";
    if (options.dryRun) return "mapped";
    await prisma.$transaction(async (tx) => {
      const code = unitCode(source.stockUnit || source.saleUnit);
      const unit = await tx.enterpriseUnitOfMeasure.upsert({ where: { organizationId_code: { organizationId: source.organizationId, code } }, update: { status: "ACTIVE", archivedAt: null }, create: { organizationId: source.organizationId, code, name: source.stockUnit || source.saleUnit, symbol: (source.stockUnit || source.saleUnit).slice(0, 20), category: "QUANTITY", createdByUserId: source.createdById } });
      const catalog = await tx.enterpriseCatalogItem.create({ data: { organizationId: source.organizationId, code: `PHP-${source.internalCode}`.slice(0, 80), sku: source.barcode || source.internalCode, name: source.name, normalizedName: normalize(`pharmacy ${source.internalCode} ${source.name}`), description: source.shortDescription, itemType: "GOODS", unitOfMeasureId: unit.id, indicativeSalePrice: source.referenceSalePrice, indicativeCost: source.referencePurchasePrice, currency: source.currency, status: source.status === "ACTIVE" ? "ACTIVE" : "INACTIVE", taxable: Boolean(source.taxRate && source.taxRate.gt(0)), trackInventory: source.stockTrackingEnabled, createdByUserId: source.createdById } });
      if (catalog.trackInventory) await tx.enterpriseInventoryItem.create({ data: { organizationId: source.organizationId, catalogItemId: catalog.id, lotTracking: true, expiryTracking: true, createdByUserId: source.createdById } });
      await tx.pharmacyProductExtension.create({ data: { organizationId: source.organizationId, pharmacyProductId: source.id, catalogItemId: catalog.id, historicalKey: `pharmacy-product:${source.id}`, createdByUserId: source.createdById } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const extension = await prisma.pharmacyProductExtension.findFirstOrThrow({ where: { organizationId: source.organizationId, pharmacyProductId: source.id } });
    await markSync({ organizationId: source.organizationId, sector: "PHARMACY", sourceEntityType: "PharmacyProduct", sourceEntityId: source.id, targetEntityType: "EnterpriseCatalogItem", targetEntityId: extension.catalogItemId, status: "SYNCED" });
    return "mapped";
  });
}

export async function backfillPharmacyPurchases(options) {
  return run("pharmacy-purchases", options, () => prisma.pharmacyPurchaseOrder.findMany({ where: backfillWhere(options), include: { lines: { orderBy: { createdAt: "asc" } } }, orderBy: { id: "asc" }, take: options.limit }), async (source) => {
    const existing = await prisma.pharmacyPurchaseExtension.findFirst({ where: { organizationId: source.organizationId, pharmacyPurchaseOrderId: source.id } });
    if (existing) return "skipped";
    const supplier = await prisma.pharmacySupplierExtension.findFirst({ where: { organizationId: source.organizationId, pharmacySupplierId: source.supplierId } });
    const products = await prisma.pharmacyProductExtension.findMany({ where: { organizationId: source.organizationId, pharmacyProductId: { in: source.lines.map((line) => line.productId) } } });
    if (!supplier?.enterpriseSupplierId || products.length !== new Set(source.lines.map((line) => line.productId)).size) {
      if (!options.dryRun) await markSync({ organizationId: source.organizationId, sector: "PHARMACY", sourceEntityType: "PharmacyPurchaseOrder", sourceEntityId: source.id, status: "AMBIGUOUS", errorCode: "PREREQUISITE_MAPPING_REQUIRED", manual: true });
      return "ambiguous";
    }
    if (options.dryRun) return "mapped";
    const productMap = new Map(products.map((item) => [item.pharmacyProductId, item.catalogItemId]));
    await prisma.$transaction(async (tx) => {
      const purchase = await tx.enterprisePurchase.create({ data: { organizationId: source.organizationId, reference: `PHPO-${source.orderNumber}`.slice(0, 120), title: `Commande Pharmacy ${source.orderNumber}`, priority: source.priority === "URGENT" ? "URGENT" : "NORMAL", status: "DRAFT", requestedByUserId: source.requestedById, buyerUserId: source.requestedById, supplierId: supplier.enterpriseSupplierId, departmentId: source.departmentId, currency: source.currency, expectedAt: source.expectedDeliveryDate, sourceModule: "PHARMACY_PURCHASES", sourceEntityType: "PharmacyPurchaseOrder", sourceEntityId: source.id, createdByUserId: source.createdById, items: { create: source.lines.map((line, index) => ({ organizationId: source.organizationId, description: `Produit Pharmacy ${line.productId}`, quantity: line.orderedQuantity, unit: line.unit, unitPrice: line.estimatedUnitPrice || 0, taxRate: 0, lineTotal: line.orderedQuantity.times(line.estimatedUnitPrice || 0), sortOrder: index })) } }, include: { items: { orderBy: { sortOrder: "asc" } } } });
      for (let index = 0; index < purchase.items.length; index += 1) await tx.enterprisePurchaseItemCatalogLink.create({ data: { organizationId: source.organizationId, purchaseItemId: purchase.items[index].id, catalogItemId: productMap.get(source.lines[index].productId), expectedItemType: "GOODS" } });
      await tx.pharmacyPurchaseExtension.create({ data: { organizationId: source.organizationId, pharmacyPurchaseOrderId: source.id, enterprisePurchaseId: purchase.id, createdByUserId: source.createdById } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const extension = await prisma.pharmacyPurchaseExtension.findFirstOrThrow({ where: { organizationId: source.organizationId, pharmacyPurchaseOrderId: source.id } });
    await markSync({ organizationId: source.organizationId, sector: "PHARMACY", sourceEntityType: "PharmacyPurchaseOrder", sourceEntityId: source.id, targetEntityType: "EnterprisePurchase", targetEntityId: extension.enterprisePurchaseId, status: "SYNCED" });
    return "mapped";
  });
}

export async function backfillPharmacyFinancialLinks(options) {
  return run("pharmacy-financial-links", options, () => prisma.pharmacySale.findMany({ where: backfillWhere(options, "saleDate"), include: { generatedInvoice: true }, orderBy: { id: "asc" }, take: options.limit }), async (source) => {
    const existing = await prisma.pharmacySalesExtension.findFirst({ where: { organizationId: source.organizationId, pharmacySaleId: source.id } });
    if (existing) return "skipped";
    const linked = await prisma.enterpriseEntityLink.findFirst({ where: { organizationId: source.organizationId, sourceEntityType: "PharmacySale", sourceEntityId: source.id, targetEntityType: "EnterpriseSalesInvoice", linkType: "SECTOR_CONVERGENCE" } });
    if (!linked) {
      if (!options.dryRun) await markSync({ organizationId: source.organizationId, sector: "PHARMACY", sourceEntityType: "PharmacySale", sourceEntityId: source.id, status: "LEGACY_UNMAPPED", errorCode: "COMMON_INVOICE_NOT_DETERMINISTIC", manual: true });
      return "ambiguous";
    }
    const invoice = await prisma.enterpriseSalesInvoice.findFirst({ where: { id: linked.targetEntityId, organizationId: source.organizationId } });
    if (!invoice) return "failed";
    if (options.dryRun) return "mapped";
    await prisma.pharmacySalesExtension.create({ data: { organizationId: source.organizationId, pharmacySaleId: source.id, salesInvoiceId: invoice.id, businessPartyId: invoice.businessPartyId, historicalKey: undefined, createdByUserId: source.createdById } }).catch(() => null);
    if (source.generatedInvoice) await prisma.pharmacyInvoiceExtension.create({ data: { organizationId: source.organizationId, pharmacyInvoiceId: source.generatedInvoice.id, salesInvoiceId: invoice.id } }).catch(() => null);
    await markSync({ organizationId: source.organizationId, sector: "PHARMACY", sourceEntityType: "PharmacySale", sourceEntityId: source.id, targetEntityType: "EnterpriseSalesInvoice", targetEntityId: invoice.id, status: "SYNCED" });
    return "mapped";
  });
}

export async function backfillHealthFinancialParties(options) {
  return run("health-financial-parties", options, () => prisma.healthPatient.findMany({ where: { ...backfillWhere(options), archivedAt: null }, orderBy: { id: "asc" }, take: options.limit }), async (source) => {
    const existing = await prisma.healthPatientFinancialProfile.findFirst({ where: { organizationId: source.organizationId, healthPatientId: source.id } });
    if (existing) return "skipped";
    if (options.dryRun) return "mapped";
    const migrationKey = `health-patient:${source.id}`;
    await prisma.$transaction(async (tx) => {
      const label = `Patient #${source.patientNumber}`;
      const party = await tx.enterpriseBusinessParty.create({ data: { organizationId: source.organizationId, partyType: "PERSON", legalName: label, displayName: label, normalizedName: label.toLowerCase(), code: `PAT-${source.patientNumber}`.slice(0, 80), migrationKey, primaryEmail: source.email, primaryPhone: source.phonePrimary, status: source.status === "ACTIVE" ? "ACTIVE" : "INACTIVE", createdByUserId: source.createdByUserId, roles: { create: { organizationId: source.organizationId, roleCode: "CUSTOMER", createdByUserId: source.createdByUserId } } } });
      await tx.healthPatientFinancialProfile.create({ data: { organizationId: source.organizationId, healthPatientId: source.id, businessPartyId: party.id, billingDisplayLabel: label, migrationKey, createdByUserId: source.createdByUserId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const profile = await prisma.healthPatientFinancialProfile.findFirstOrThrow({ where: { organizationId: source.organizationId, healthPatientId: source.id } });
    await markSync({ organizationId: source.organizationId, sector: "HEALTH_CARE", sourceEntityType: "HealthPatient", sourceEntityId: source.id, targetEntityType: "EnterpriseBusinessParty", targetEntityId: profile.businessPartyId, status: "SYNCED" });
    return "mapped";
  });
}

export async function backfillHealthServiceCatalog(options) {
  return run("health-service-catalog", options, () => prisma.healthBillingServiceCatalog.findMany({ where: backfillWhere(options), orderBy: { id: "asc" }, take: options.limit }), async (source) => {
    const existing = await prisma.healthServiceCatalogExtension.findFirst({ where: { organizationId: source.organizationId, healthBillingServiceCatalogId: source.id } });
    if (existing) return "skipped";
    if (options.dryRun) return "mapped";
    await prisma.$transaction(async (tx) => {
      const unit = await tx.enterpriseUnitOfMeasure.upsert({ where: { organizationId_code: { organizationId: source.organizationId, code: "SERVICE" } }, update: { status: "ACTIVE", archivedAt: null }, create: { organizationId: source.organizationId, code: "SERVICE", name: "Service", symbol: "srv", category: "SERVICE", createdByUserId: source.createdByUserId } });
      const catalog = await tx.enterpriseCatalogItem.create({ data: { organizationId: source.organizationId, code: `HCS-${source.code}`.slice(0, 80), sku: `HEALTH-${source.code}`.slice(0, 120), name: source.labelFr, normalizedName: normalize(`health service ${source.code} ${source.labelFr}`), description: source.labelEn, itemType: "SERVICE", unitOfMeasureId: unit.id, indicativeSalePrice: source.defaultPrice, currency: source.currency, status: source.isActive && source.billable ? "ACTIVE" : "INACTIVE", taxable: false, trackInventory: false, createdByUserId: source.createdByUserId } });
      await tx.healthServiceCatalogExtension.create({ data: { organizationId: source.organizationId, healthBillingServiceCatalogId: source.id, catalogItemId: catalog.id, createdByUserId: source.createdByUserId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const extension = await prisma.healthServiceCatalogExtension.findFirstOrThrow({ where: { organizationId: source.organizationId, healthBillingServiceCatalogId: source.id } });
    await markSync({ organizationId: source.organizationId, sector: "HEALTH_CARE", sourceEntityType: "HealthBillingServiceCatalog", sourceEntityId: source.id, targetEntityType: "EnterpriseCatalogItem", targetEntityId: extension.catalogItemId, status: "SYNCED" });
    return "mapped";
  });
}

export async function backfillHealthInvoices(options) {
  return run("health-invoices", options, () => prisma.healthMedicalInvoice.findMany({ where: backfillWhere(options, "invoiceDate"), orderBy: { id: "asc" }, take: options.limit }), async (source) => {
    const existing = await prisma.healthBillingExtension.findFirst({ where: { organizationId: source.organizationId, healthMedicalInvoiceId: source.id } });
    if (existing) return "skipped";
    const linked = await prisma.enterpriseEntityLink.findFirst({ where: { organizationId: source.organizationId, sourceEntityType: "HealthMedicalInvoice", sourceEntityId: source.id, targetEntityType: "EnterpriseSalesInvoice", linkType: "SECTOR_CONVERGENCE" } });
    if (!linked) {
      if (!options.dryRun) await markSync({ organizationId: source.organizationId, sector: "HEALTH_CARE", sourceEntityType: "HealthMedicalInvoice", sourceEntityId: source.id, status: "LEGACY_UNMAPPED", errorCode: "COMMON_INVOICE_NOT_DETERMINISTIC", manual: true });
      return "ambiguous";
    }
    if (options.dryRun) return "mapped";
    const invoice = await prisma.enterpriseSalesInvoice.findFirst({ where: { id: linked.targetEntityId, organizationId: source.organizationId } });
    const profile = await prisma.healthPatientFinancialProfile.findFirst({ where: { organizationId: source.organizationId, healthPatientId: source.patientId } });
    if (!invoice || !profile) return "failed";
    await prisma.healthBillingExtension.create({ data: { organizationId: source.organizationId, healthMedicalInvoiceId: source.id, salesInvoiceId: invoice.id, patientFinancialProfileId: profile.id, consultationId: source.consultationId, labRequestId: source.labRequestId, pharmacyDispensationId: source.pharmacyDispensationId } });
    await markSync({ organizationId: source.organizationId, sector: "HEALTH_CARE", sourceEntityType: "HealthMedicalInvoice", sourceEntityId: source.id, targetEntityType: "EnterpriseSalesInvoice", targetEntityId: invoice.id, status: "SYNCED" });
    return "mapped";
  });
}

export async function backfillHealthPayments(options) {
  return run("health-payments", options, () => prisma.healthMedicalInvoicePayment.findMany({ where: backfillWhere(options, "paymentDate"), orderBy: { id: "asc" }, take: options.limit }), async (source) => {
    const existing = await prisma.healthPaymentExtension.findFirst({ where: { organizationId: source.organizationId, healthMedicalInvoicePaymentId: source.id } });
    if (existing) return "skipped";
    if (!options.dryRun) await markSync({ organizationId: source.organizationId, sector: "HEALTH_CARE", sourceEntityType: "HealthMedicalInvoicePayment", sourceEntityId: source.id, status: "LEGACY_UNMAPPED", errorCode: "PAYER_OR_TREASURY_ACCOUNT_NOT_DETERMINISTIC", manual: true });
    return "ambiguous";
  });
}

export async function disconnectSectorBackfillPrisma() {
  await prisma.$disconnect();
}
