import { Prisma } from "@prisma/client";
import { money, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { createEnterprisePayment } from "@/lib/enterprise/accounting/payments-service";
import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";
import { prisma } from "@/lib/prisma";
import { EnterpriseSectorConvergenceError } from "@/lib/enterprise/sector-convergence/errors";
import { isSectorConvergenceEnabled, SECTOR_CONVERGENCE_FLAGS } from "@/lib/enterprise/sector-convergence/flags";
import { beginSectorSync, completeSectorSync, sectorIdempotencyKey } from "@/lib/enterprise/sector-convergence/sync-service";

function methodType(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (["CASH", "CARD", "CHEQUE", "BANK_TRANSFER", "MOBILE_MONEY"].includes(normalized)) return normalized as "CASH" | "CARD" | "CHEQUE" | "BANK_TRANSFER" | "MOBILE_MONEY";
  if (["TRANSFER", "BANK", "VIREMENT"].includes(normalized)) return "BANK_TRANSFER" as const;
  if (["MOBILE", "MOBILEMONEY", "M_PESA", "AIRTEL_MONEY", "ORANGE_MONEY"].includes(normalized)) return "MOBILE_MONEY" as const;
  return "OTHER" as const;
}

export async function convergeHealthPayment(
  organizationId: string,
  healthMedicalInvoicePaymentId: string,
  payerComponentId: string,
  financialAccountId: string,
  actorUserId: string,
  options: { bypassFeatureFlag?: boolean } = {},
) {
  if (!options.bypassFeatureFlag) {
    const enabled = await isSectorConvergenceEnabled({ organizationId, sector: "HEALTH_CARE", domainCode: "PAYMENTS", flag: SECTOR_CONVERGENCE_FLAGS.HEALTH_PAYMENT });
    if (!enabled) throw new EnterpriseSectorConvergenceError("HEALTH_PAYMENT_CONVERGENCE_DISABLED", 409);
  }
  const existing = await prisma.healthPaymentExtension.findFirst({ where: { organizationId, healthMedicalInvoicePaymentId } });
  if (existing) return { extension: existing, payment: await prisma.enterprisePayment.findUniqueOrThrow({ where: { id: existing.paymentId } }), idempotent: true };
  const source = await prisma.healthMedicalInvoicePayment.findFirst({ where: { id: healthMedicalInvoicePaymentId, organizationId }, include: { invoice: true } });
  if (!source) throw new EnterpriseSectorConvergenceError("HEALTH_PAYMENT_NOT_FOUND", 404);
  if (["CANCELLED", "REVERSED"].includes(source.status)) throw new EnterpriseSectorConvergenceError("HEALTH_PAYMENT_NOT_CONVERGIBLE", 409);
  const component = await prisma.healthInvoicePayerComponent.findFirst({ where: { id: payerComponentId, organizationId, healthMedicalInvoiceId: source.invoiceId } });
  if (!component) throw new EnterpriseSectorConvergenceError("HEALTH_PAYER_COMPONENT_INVALID", 409);
  if (component.currencyCode !== source.invoice.currency) throw new EnterpriseSectorConvergenceError("HEALTH_PAYMENT_CURRENCY_MISMATCH", 409);
  const stableKey = sectorIdempotencyKey({ organizationId, sector: "HEALTH_CARE", sourceEntityType: "HealthMedicalInvoicePayment", sourceEntityId: source.id, eventType: component.payerType === "INSURER" ? "HEALTH_INSURANCE_PAYMENT_CONFIRMED" : "HEALTH_PATIENT_PAYMENT_CONFIRMED" });
  let payment = await prisma.enterprisePayment.findFirst({ where: { organizationId, idempotencyKey: stableKey } });
  if (!payment) {
    payment = await createEnterprisePayment(organizationId, actorUserId, {
      direction: "INBOUND",
      paymentType: "CUSTOMER_PAYMENT",
      methodType: methodType(source.paymentMethod),
      financialAccountId,
      businessPartyId: component.businessPartyId,
      currencyCode: source.invoice.currency,
      amount: source.amount.toFixed(),
      paymentDate: source.paymentDate,
      reference: source.paymentReference || source.receiptNumber,
      maskedExternalReference: source.paymentReference?.slice(-12),
      idempotencyKey: stableKey,
    });
  }
  const extension = await prisma.$transaction(async (tx) => {
    const mapped = await tx.healthPaymentExtension.findFirst({ where: { organizationId, healthMedicalInvoicePaymentId: source.id } });
    if (mapped) return mapped;
    const created = await tx.healthPaymentExtension.create({
      data: {
        organizationId,
        healthMedicalInvoicePaymentId: source.id,
        paymentId: payment!.id,
        payerType: component.payerType,
        payerBusinessPartyId: component.businessPartyId,
      },
    });
    const sync = await beginSectorSync(tx, { organizationId, sector: "HEALTH_CARE", sourceEntityType: "HealthMedicalInvoicePayment", sourceEntityId: source.id, eventType: component.payerType === "INSURER" ? "HEALTH_INSURANCE_PAYMENT_CONFIRMED" : "HEALTH_PATIENT_PAYMENT_CONFIRMED" }, { payerComponentId: component.id });
    await completeSectorSync(tx, sync.id, { targetEntityType: "EnterprisePayment", targetEntityId: payment!.id });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { extension, payment, payerComponent: component, idempotent: false };
}

export async function allocateHealthPaymentToPayerComponent(
  organizationId: string,
  paymentId: string,
  payerComponentId: string,
  actorUserId: string,
  input: { amount: string },
) {
  const allocation = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePayment" WHERE id = ${paymentId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "HealthInvoicePayerComponent" WHERE id = ${payerComponentId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const payment = await tx.enterprisePayment.findFirst({ where: { id: paymentId, organizationId, status: { in: ["CONFIRMED", "RECONCILED"] } } });
    if (!payment || payment.direction !== "INBOUND" || payment.paymentType !== "CUSTOMER_PAYMENT") throw new EnterpriseSectorConvergenceError("HEALTH_PAYMENT_NOT_ALLOCATABLE", 409);
    const component = await tx.healthInvoicePayerComponent.findFirst({ where: { id: payerComponentId, organizationId } });
    if (!component?.receivableId) throw new EnterpriseSectorConvergenceError("HEALTH_PAYER_RECEIVABLE_REQUIRED", 409);
    if (payment.businessPartyId !== component.businessPartyId || payment.currencyCode !== component.currencyCode) throw new EnterpriseSectorConvergenceError("HEALTH_PAYMENT_PAYER_SCOPE_INVALID", 409);
    const amount = money(input.amount);
    if (!amount.isPositive() || amount.greaterThan(payment.unallocatedAmount) || amount.greaterThan(component.outstandingAmount)) throw new EnterpriseSectorConvergenceError("HEALTH_PAYMENT_ALLOCATION_EXCEEDS_BALANCE", 409);
    const receivable = await tx.enterpriseReceivable.findFirst({ where: { id: component.receivableId, organizationId, status: "OPEN" } });
    if (!receivable || amount.greaterThan(receivable.outstandingAmount)) throw new EnterpriseSectorConvergenceError("COMMON_RECEIVABLE_ALLOCATION_INVALID", 409);
    const existing = await tx.enterprisePaymentAllocation.findFirst({ where: { organizationId, paymentId, receivableId: receivable.id } });
    if (existing) {
      const sectorExisting = await tx.healthPayerAllocation.findFirst({ where: { organizationId, payerComponentId, paymentAllocationId: existing.id } });
      if (!sectorExisting) throw new EnterpriseSectorConvergenceError("HEALTH_ALLOCATION_MAPPING_INCOMPLETE", 409);
      return { paymentAllocation: existing, sectorAllocation: sectorExisting, idempotent: true };
    }
    const paymentAllocation = await tx.enterprisePaymentAllocation.create({ data: { organizationId, paymentId, receivableId: receivable.id, amount, allocatedByUserId: actorUserId } });
    const sectorAllocation = await tx.healthPayerAllocation.create({ data: { organizationId, payerComponentId, paymentAllocationId: paymentAllocation.id, amount } });
    const nextPaymentUnallocated = money(payment.unallocatedAmount.minus(amount));
    const nextReceivableOutstanding = money(receivable.outstandingAmount.minus(amount));
    const nextComponentOutstanding = money(component.outstandingAmount.minus(amount));
    await tx.enterprisePayment.update({ where: { id: payment.id }, data: { unallocatedAmount: nextPaymentUnallocated, revision: { increment: 1 } } });
    await tx.enterpriseReceivable.update({ where: { id: receivable.id }, data: { allocatedAmount: { increment: amount }, outstandingAmount: nextReceivableOutstanding, status: nextReceivableOutstanding.isZero() ? "CLOSED" : "OPEN" } });
    await tx.enterpriseSalesInvoice.update({ where: { id: receivable.salesInvoiceId }, data: { amountPaid: { increment: amount }, outstandingAmount: nextReceivableOutstanding, status: nextReceivableOutstanding.isZero() ? "PAID" : "PARTIALLY_PAID", revision: { increment: 1 } } });
    await tx.enterpriseReceivableAllocation.create({ data: { organizationId, receivableId: receivable.id, sourceType: "PAYMENT", sourceId: paymentAllocation.id, amount, allocationDate: new Date(), createdByUserId: actorUserId } });
    await tx.healthInvoicePayerComponent.update({ where: { id: component.id }, data: { settledAmount: { increment: amount }, outstandingAmount: nextComponentOutstanding, status: nextComponentOutstanding.isZero() ? "SETTLED" : "PARTIALLY_SETTLED", revision: { increment: 1 } } });
    await tx.enterprisePaymentEvent.create({ data: { organizationId, paymentId: payment.id, eventType: "HEALTH_PAYER_ALLOCATED", summary: "Health payer component allocation confirmed", actorUserId, metadataJson: { payerComponentId, paymentAllocationId: paymentAllocation.id, amount: amount.toFixed() } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterprisePaymentAllocation", entityId: paymentAllocation.id, eventType: "HEALTH_PAYER_ALLOCATION_CONFIRMED", summary: "Health payer allocation confirmed", actorUserId, toStatus: "CONFIRMED", metadataJson: { payerComponentId, payerType: component.payerType, amount: amount.toFixed() } });
    return { paymentAllocation, sectorAllocation, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (!allocation.idempotent) {
    await postBusinessEvent(organizationId, actorUserId, { postingEvent: "PAYMENT_ALLOCATION_CONFIRMED", sourceEntityType: "EnterprisePaymentAllocation", sourceEntityId: allocation.paymentAllocation.id });
  }
  return allocation;
}
