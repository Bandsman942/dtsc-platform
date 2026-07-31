import { Prisma } from "@prisma/client";
import { financeReference, money, publishFinanceEvent, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import { prisma } from "@/lib/prisma";
import { EnterpriseSectorConvergenceError } from "@/lib/enterprise/sector-convergence/errors";
import { isSectorConvergenceEnabled, SECTOR_CONVERGENCE_FLAGS } from "@/lib/enterprise/sector-convergence/flags";
import { beginSectorSync, completeSectorSync, failSectorSync } from "@/lib/enterprise/sector-convergence/sync-service";

export type HealthPayerComponentInput = {
  payerType: "PATIENT" | "INSURER" | "EMPLOYER" | "PARTNER" | "OTHER_THIRD_PARTY";
  businessPartyId: string;
  requestedAmount: string;
};

export async function convergeHealthMedicalInvoice(
  organizationId: string,
  healthMedicalInvoiceId: string,
  payerComponents: HealthPayerComponentInput[],
  actorUserId: string,
  options: { bypassFeatureFlag?: boolean; eventVersion?: number } = {},
) {
  if (!options.bypassFeatureFlag) {
    const enabled = await isSectorConvergenceEnabled({ organizationId, sector: "HEALTH_CARE", domainCode: "BILLING", flag: SECTOR_CONVERGENCE_FLAGS.HEALTH_BILLING });
    if (!enabled) throw new EnterpriseSectorConvergenceError("HEALTH_BILLING_CONVERGENCE_DISABLED", 409);
  }
  const existing = await prisma.healthBillingExtension.findFirst({ where: { organizationId, healthMedicalInvoiceId } });
  if (existing) return { extension: existing, invoice: await prisma.enterpriseSalesInvoice.findUniqueOrThrow({ where: { id: existing.salesInvoiceId } }), idempotent: true };
  const source = await prisma.healthMedicalInvoice.findFirst({ where: { id: healthMedicalInvoiceId, organizationId }, include: { items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } });
  if (!source) throw new EnterpriseSectorConvergenceError("HEALTH_MEDICAL_INVOICE_NOT_FOUND", 404);
  if (["CANCELLED", "VOIDED"].includes(source.status)) throw new EnterpriseSectorConvergenceError("HEALTH_MEDICAL_INVOICE_NOT_CONVERGIBLE", 409);
  if (!source.items.length || !source.totalAmount.isPositive()) throw new EnterpriseSectorConvergenceError("HEALTH_MEDICAL_INVOICE_TOTAL_INVALID", 409);
  const patientProfile = await prisma.healthPatientFinancialProfile.findFirst({ where: { organizationId, healthPatientId: source.patientId } });
  if (!patientProfile) throw new EnterpriseSectorConvergenceError("HEALTH_PATIENT_FINANCIAL_PROFILE_REQUIRED", 409);
  const serviceIds = source.items.map((item) => item.serviceCatalogId).filter((value): value is string => Boolean(value));
  if (serviceIds.length !== source.items.length) throw new EnterpriseSectorConvergenceError("HEALTH_BILLING_CATALOG_ITEM_REQUIRED", 409);
  const serviceMappings = await prisma.healthServiceCatalogExtension.findMany({ where: { organizationId, healthBillingServiceCatalogId: { in: serviceIds } } });
  const catalogByService = new Map(serviceMappings.map((item) => [item.healthBillingServiceCatalogId, item.catalogItemId]));
  const missing = source.items.filter((item) => !item.serviceCatalogId || !catalogByService.has(item.serviceCatalogId));
  if (missing.length) throw new EnterpriseSectorConvergenceError("HEALTH_SERVICE_CATALOG_MAPPING_REQUIRED", 409, { sourceItemIds: missing.map((item) => item.id) });
  if (!payerComponents.length) throw new EnterpriseSectorConvergenceError("HEALTH_PAYER_COMPONENT_REQUIRED", 409);
  const componentTotal = money(sumDecimals(payerComponents.map((component) => component.requestedAmount)));
  if (!componentTotal.equals(money(source.totalAmount))) throw new EnterpriseSectorConvergenceError("HEALTH_PAYER_COMPONENT_TOTAL_MISMATCH", 409, { invoiceTotal: source.totalAmount.toFixed(), componentTotal: componentTotal.toFixed() });
  const parties = await prisma.enterpriseBusinessParty.findMany({ where: { organizationId, id: { in: payerComponents.map((component) => component.businessPartyId) }, status: "ACTIVE", archivedAt: null }, include: { roles: { where: { status: "ACTIVE", archivedAt: null } } } });
  if (parties.length !== new Set(payerComponents.map((component) => component.businessPartyId)).size) throw new EnterpriseSectorConvergenceError("HEALTH_PAYER_PARTY_INVALID", 409);
  const roleByParty = new Map(parties.map((party) => [party.id, new Set(party.roles.map((role) => role.roleCode))]));
  for (const component of payerComponents) {
    if (component.payerType === "PATIENT" && component.businessPartyId !== patientProfile.businessPartyId) throw new EnterpriseSectorConvergenceError("HEALTH_PATIENT_PAYER_INVALID", 409);
    if (component.payerType === "INSURER" && !roleByParty.get(component.businessPartyId)?.has("INSURER")) throw new EnterpriseSectorConvergenceError("HEALTH_INSURER_ROLE_REQUIRED", 409);
  }

  const sync = await prisma.$transaction((tx) => beginSectorSync(tx, { organizationId, sector: "HEALTH_CARE", sourceEntityType: "HealthMedicalInvoice", sourceEntityId: source.id, eventType: "HEALTH_MEDICAL_INVOICE_POSTED", eventVersion: options.eventVersion || 1 }, { invoiceNumber: source.invoiceNumber }));
  try {
    const result = await prisma.$transaction(async (tx) => {
      const mapped = await tx.healthBillingExtension.findFirst({ where: { organizationId, healthMedicalInvoiceId: source.id } });
      if (mapped) return { extension: mapped, invoice: await tx.enterpriseSalesInvoice.findUniqueOrThrow({ where: { id: mapped.salesInvoiceId } }) };
      const current = await tx.healthMedicalInvoice.findFirst({ where: { id: source.id, organizationId }, include: { items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } });
      if (!current) throw new EnterpriseSectorConvergenceError("HEALTH_MEDICAL_INVOICE_NOT_FOUND", 404);
      const itemTotal = money(sumDecimals(current.items.map((item) => item.totalAmount)));
      if (itemTotal.minus(current.totalAmount).abs().greaterThan(new Prisma.Decimal("0.01"))) throw new EnterpriseSectorConvergenceError("HEALTH_INVOICE_ITEM_TOTAL_MISMATCH", 409, { invoiceTotal: current.totalAmount.toFixed(), itemTotal: itemTotal.toFixed() });
      const invoice = await tx.enterpriseSalesInvoice.create({
        data: {
          organizationId,
          number: financeReference("INV-HL"),
          businessPartyId: patientProfile.businessPartyId,
          status: "DRAFT",
          invoiceDate: current.invoiceDate,
          dueDate: current.dueDate,
          currencyCode: current.currency,
          subtotal: money(current.subtotalAmount),
          discountTotal: money(current.discountAmount),
          taxTotal: money(current.taxAmount),
          grandTotal: money(current.totalAmount),
          outstandingAmount: money(current.totalAmount),
          notes: `Health billing ${current.invoiceNumber}`,
          createdByUserId: actorUserId,
          items: {
            create: current.items.map((item) => ({
              organizationId,
              catalogItemId: catalogByService.get(item.serviceCatalogId!),
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountAmount: item.discountAmount,
              netAmount: item.totalAmount,
              taxAmount: 0,
              totalAmount: item.totalAmount,
            })),
          },
        },
        include: { items: true },
      });
      const extension = await tx.healthBillingExtension.create({
        data: {
          organizationId,
          healthMedicalInvoiceId: current.id,
          salesInvoiceId: invoice.id,
          patientFinancialProfileId: patientProfile.id,
          consultationId: current.consultationId,
          labRequestId: current.labRequestId,
          pharmacyDispensationId: current.pharmacyDispensationId,
          confidentialityLevel: "MEDICAL_CONFIDENTIAL",
        },
      });
      await tx.healthInvoicePayerComponent.createMany({
        data: payerComponents.map((component) => ({
          organizationId,
          healthMedicalInvoiceId: current.id,
          salesInvoiceId: invoice.id,
          payerType: component.payerType,
          businessPartyId: component.businessPartyId,
          currencyCode: current.currency,
          requestedAmount: money(component.requestedAmount),
          approvedAmount: component.payerType === "PATIENT" ? money(component.requestedAmount) : money(0),
          outstandingAmount: money(component.requestedAmount),
          status: component.payerType === "INSURER" ? "PENDING_APPROVAL" : "OPEN",
        })),
      });
      await tx.enterpriseEntityLink.create({ data: { organizationId, sourceModule: "MEDICAL_BILLING", sourceEntityType: "HealthMedicalInvoice", sourceEntityId: current.id, targetModule: "FINANCE_RECEIVABLES", targetEntityType: "EnterpriseSalesInvoice", targetEntityId: invoice.id, linkType: "SECTOR_CONVERGENCE", createdById: actorUserId } }).catch((error) => { if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error; });
      await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSalesInvoice", entityId: invoice.id, eventType: "HEALTH_MEDICAL_INVOICE_CREATED", summary: `Common invoice ${invoice.number} created from Health billing`, actorUserId, toStatus: "DRAFT", metadataJson: { healthMedicalInvoiceId: current.id, payerComponentCount: payerComponents.length, confidentialityLevel: "MEDICAL_CONFIDENTIAL" } });
      await completeSectorSync(tx, sync.id, { targetEntityType: "EnterpriseSalesInvoice", targetEntityId: invoice.id });
      return { extension, invoice };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ...result, idempotent: false };
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    await failSectorSync({ organizationId, syncStateId: sync.id, status: duplicate ? "AMBIGUOUS" : "FAILED", errorCode: duplicate ? "HEALTH_INVOICE_MAPPING_AMBIGUOUS" : "HEALTH_INVOICE_MAPPING_FAILED", requiresManualAction: duplicate });
    throw error;
  }
}

export async function bindHealthPayerComponentsToReceivable(organizationId: string, healthMedicalInvoiceId: string) {
  const extension = await prisma.healthBillingExtension.findFirst({ where: { organizationId, healthMedicalInvoiceId } });
  if (!extension) throw new EnterpriseSectorConvergenceError("HEALTH_BILLING_MAPPING_REQUIRED", 409);
  const invoice = await prisma.enterpriseSalesInvoice.findFirst({ where: { id: extension.salesInvoiceId, organizationId }, include: { receivable: true } });
  if (!invoice?.receivable) throw new EnterpriseSectorConvergenceError("COMMON_RECEIVABLE_NOT_CREATED", 409);
  await prisma.healthInvoicePayerComponent.updateMany({ where: { organizationId, healthMedicalInvoiceId, receivableId: null }, data: { receivableId: invoice.receivable.id } });
  return prisma.healthInvoicePayerComponent.findMany({ where: { organizationId, healthMedicalInvoiceId }, orderBy: [{ payerType: "asc" }, { createdAt: "asc" }] });
}
