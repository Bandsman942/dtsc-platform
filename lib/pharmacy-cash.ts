import type { z } from "zod";
import type { cashCreateSchema } from "@/lib/pharmacy-cash-validators";
import { prisma } from "@/lib/prisma";
import { generatePharmacyEntityNumber, getEffectivePharmacySettings } from "@/lib/pharmacy-settings";

type CashInput = z.infer<typeof cashCreateSchema>;
const nil = <T>(value: T | "" | undefined) => value === "" || value === undefined ? null : value;
const activePaymentStatuses = ["PAID", "VALIDATED"];
const roundMoney = (value: number) => Math.round(value * 100) / 100;

export async function recalculateSalePaymentStatus(organizationId: string, saleId: string) {
  const sale = await prisma.pharmacySale.findFirst({ where: { id: saleId, organizationId }, select: { id: true, totalAmount: true, exchangeRateToBase: true, invoiceId: true } });
  if (!sale) throw new Error("SALE_NOT_FOUND");
  const aggregate = await prisma.pharmacyPayment.aggregate({ where: { organizationId, saleId, status: { in: activePaymentStatuses } }, _sum: { amount: true } });
  const paid = Number(aggregate._sum.amount || 0);
  const remaining = Math.max(0, Number(sale.totalAmount) - paid);
  const paymentStatus = remaining === 0 ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "UNPAID";
  const exchangeRate = Number(sale.exchangeRateToBase || 1);
  await prisma.pharmacySale.update({ where: { id: sale.id }, data: { paidAmount: paid, remainingAmount: remaining, paidAmountBase: roundMoney(paid * exchangeRate), remainingAmountBase: roundMoney(remaining * exchangeRate), paymentStatus, status: paymentStatus === "PAID" ? "PAID" : undefined } });
  if (sale.invoiceId) await prisma.pharmacyInvoice.updateMany({ where: { id: sale.invoiceId, organizationId }, data: { paidAmount: paid, remainingAmount: remaining, status: remaining === 0 ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "ISSUED" } });
}

export async function calculateCashSessionTotals(organizationId: string, cashSessionId: string) {
  const session = await prisma.pharmacyCashSession.findFirst({ where: { id: cashSessionId, organizationId } });
  if (!session) throw new Error("SESSION_NOT_FOUND");
  const [payments, refunds, sales] = await Promise.all([
    prisma.pharmacyPayment.findMany({ where: { organizationId, cashSessionId, status: { in: activePaymentStatuses } }, select: { amount: true, paymentMethod: true } }),
    prisma.pharmacyRefund.findMany({ where: { organizationId, cashSessionId, status: { in: ["VALIDATED", "PAID"] } }, select: { amount: true } }),
    prisma.pharmacySale.findMany({ where: { organizationId, cashSessionId, status: { notIn: ["CANCELLED", "REJECTED"] } }, select: { totalAmount: true } }),
  ]);
  const byMethod = (method: string) => payments.filter((item) => item.paymentMethod === method).reduce((sum, item) => sum + Number(item.amount), 0);
  const totalPayments = payments.reduce((sum, item) => sum + Number(item.amount), 0);
  const totalRefunds = refunds.reduce((sum, item) => sum + Number(item.amount), 0);
  const totalCashPayments = byMethod("CASH");
  return { totalCashPayments, totalMobileMoneyPayments: byMethod("MOBILE_MONEY"), totalCardPayments: byMethod("CARD"), totalTransferPayments: byMethod("TRANSFER"), totalCreditPayments: byMethod("CREDIT"), totalInsurancePayments: byMethod("INSURANCE"), totalRefunds, totalSales: sales.reduce((sum, item) => sum + Number(item.totalAmount), 0), totalPayments, theoreticalCashAmount: Number(session.openingAmount) + totalCashPayments - totalRefunds };
}

export async function openCashSession(organizationId: string, userId: string, data: Extract<CashInput, { entityType: "session" }>) {
  const cashSettings = (await getEffectivePharmacySettings(organizationId, userId)).sections["cash-payments"];
  const [cashier, department, existing] = await Promise.all([
    prisma.organizationMember.findFirst({ where: { organizationId, userId: data.cashierId, status: "ACTIVE", removedAt: null }, select: { id: true } }),
    data.departmentId ? prisma.enterpriseDepartment.findFirst({ where: { id: data.departmentId, organizationId, isActive: true }, select: { id: true } }) : null,
    prisma.pharmacyCashSession.findFirst({ where: { organizationId, cashierId: data.cashierId, status: { in: ["OPEN", "CLOSING", "PENDING_VALIDATION"] } }, select: { id: true } }),
  ]);
  if (!cashier) throw new Error("CASHIER_NOT_FOUND");
  if (data.departmentId && !department) throw new Error("DEPARTMENT_NOT_FOUND");
  if (existing && !cashSettings.allowMultipleOpenCashSessionsPerCashier) throw new Error("CASHIER_ALREADY_OPEN");
  if (cashSettings.cashSessionRequiresOpeningAmount && data.openingAmount < 0) throw new Error("OPENING_AMOUNT_REQUIRED");
  return prisma.pharmacyCashSession.create({ data: { organizationId, cashSessionNumber: data.cashSessionNumber || await generatePharmacyEntityNumber(organizationId, "CASH_SESSION"), cashPointName: nil(data.cashPointName), cashPointType: data.cashPointType, cashierId: data.cashierId, departmentId: nil(data.departmentId), financialAccountId: nil(data.financialAccountId), openedAt: data.openedAt, openingAmount: data.openingAmount, currency: data.currency, status: "OPEN", notes: nil(data.notes), createdById: userId, updatedById: userId } });
}

export async function createPayment(organizationId: string, userId: string, data: Extract<CashInput, { entityType: "payment" }>) {
  const cashSettings = (await getEffectivePharmacySettings(organizationId, userId)).sections["cash-payments"];
  const saleId = nil(data.saleId);
  const invoiceId = nil(data.invoiceId);
  const cashSessionId = nil(data.cashSessionId);
  const [sale, invoice, session, cashier] = await Promise.all([
    saleId ? prisma.pharmacySale.findFirst({ where: { id: saleId, organizationId, status: { notIn: ["CANCELLED", "REJECTED", "REFUNDED"] } } }) : null,
    invoiceId ? prisma.pharmacyInvoice.findFirst({ where: { id: invoiceId, organizationId, status: { notIn: ["CANCELLED", "ARCHIVED"] } } }) : null,
    cashSessionId ? prisma.pharmacyCashSession.findFirst({ where: { id: cashSessionId, organizationId, status: "OPEN" } }) : null,
    prisma.organizationMember.findFirst({ where: { organizationId, userId: data.cashierId, status: "ACTIVE", removedAt: null }, select: { id: true } }),
  ]);
  if (saleId && !sale) throw new Error("SALE_NOT_FOUND");
  if (invoiceId && !invoice) throw new Error("INVOICE_NOT_FOUND");
  if (saleId && invoice?.saleId && invoice.saleId !== saleId) throw new Error("SALE_INVOICE_MISMATCH");
  if (sale && data.currency !== sale.currency) throw new Error("PAYMENT_CURRENCY_MISMATCH");
  if (!cashier) throw new Error("CASHIER_NOT_FOUND");
  if (data.paymentMethod !== "CREDIT" && !cashSessionId && cashSettings.requireCashSessionForSales && !cashSettings.allowPaymentWithoutCashSession) throw new Error("SESSION_REQUIRED");
  if (cashSessionId && !session) throw new Error("SESSION_NOT_OPEN");
  const targetRemaining = sale ? Number(sale.remainingAmount) : invoice ? Number(invoice.remainingAmount) : data.amount;
  if (data.amount > targetRemaining) throw new Error("PAYMENT_EXCEEDS_REMAINING");
  const effectiveSaleId = saleId || invoice?.saleId || null;
  const payment = await prisma.pharmacyPayment.create({ data: { organizationId, paymentNumber: await generatePharmacyEntityNumber(organizationId, "PAYMENT"), saleId: effectiveSaleId, invoiceId, cashSessionId, cashierId: data.cashierId, paymentMethod: data.paymentMethod, amount: data.amount, currency: data.currency, paymentReference: nil(data.paymentReference), payerName: nil(data.payerName), payerPhone: nil(data.payerPhone), paymentDate: data.paymentDate, status: "PAID", notes: nil(data.notes), createdById: userId, updatedById: userId } });
  if (effectiveSaleId) {
    await prisma.pharmacySale.updateMany({ where: { id: effectiveSaleId, organizationId }, data: { cashSessionId, paymentMethod: data.paymentMethod, updatedById: userId } });
    await recalculateSalePaymentStatus(organizationId, effectiveSaleId);
  }
  return payment;
}

export async function generateInvoiceFromSale(organizationId: string, saleId: string, userId: string) {
  const sale = await prisma.pharmacySale.findFirst({ where: { id: saleId, organizationId }, include: { payments: { where: { status: { in: activePaymentStatuses } } } } });
  if (!sale) throw new Error("SALE_NOT_FOUND");
  const existing = await prisma.pharmacyInvoice.findFirst({ where: { organizationId, saleId, status: { notIn: ["CANCELLED", "ARCHIVED"] } } });
  if (existing) return existing;
  const paid = sale.payments.reduce((sum, item) => sum + Number(item.amount), 0);
  const invoiceNumber = await generatePharmacyEntityNumber(organizationId, "INVOICE");
  return prisma.$transaction(async (transaction) => {
    const invoice = await transaction.pharmacyInvoice.create({ data: { organizationId, invoiceNumber, saleId: sale.id, customerName: sale.customerName, invoiceDate: new Date(), subtotal: sale.subtotal, discount: sale.globalDiscount, taxAmount: sale.taxAmount, totalAmount: sale.totalAmount, paidAmount: paid, remainingAmount: Math.max(0, Number(sale.totalAmount) - paid), currency: sale.currency, status: paid >= Number(sale.totalAmount) ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "ISSUED", createdById: userId, updatedById: userId } });
    await transaction.pharmacySale.update({ where: { id: sale.id }, data: { invoiceId: invoice.id, updatedById: userId } });
    return invoice;
  });
}

export async function generateReceiptForPayment(organizationId: string, paymentId: string, userId: string) {
  const payment = await prisma.pharmacyPayment.findFirst({ where: { id: paymentId, organizationId, status: { in: activePaymentStatuses } }, include: { sale: { include: { lines: true } } } });
  if (!payment) throw new Error("PAYMENT_NOT_FOUND");
  const existing = await prisma.pharmacyCashReceipt.findFirst({ where: { organizationId, paymentId, status: { not: "CANCELLED" } } });
  if (existing) return existing;
  const receiptNumber = await generatePharmacyEntityNumber(organizationId, "CASH_RECEIPT");
  const htmlContent = `<main><h1>Reçu ${payment.paymentNumber}</h1><p>Montant payé: ${Number(payment.amount).toFixed(2)} ${payment.currency}</p><p>Mode: ${payment.paymentMethod}</p><p>Powered by DTSC Platform</p></main>`;
  return prisma.pharmacyCashReceipt.create({ data: { organizationId, receiptNumber, saleId: payment.saleId, paymentId: payment.id, invoiceId: payment.invoiceId, customerName: payment.sale?.customerName, cashierId: payment.cashierId, amount: payment.amount, paymentMethod: payment.paymentMethod, htmlContent, generatedById: userId } });
}

export async function createRefund(organizationId: string, userId: string, data: Extract<CashInput, { entityType: "refund" }>) {
  const cashSettings = (await getEffectivePharmacySettings(organizationId, userId)).sections["cash-payments"];
  const paymentId = nil(data.paymentId);
  const cashSessionId = nil(data.cashSessionId);
  const [sale, payment, session, aggregate] = await Promise.all([
    prisma.pharmacySale.findFirst({ where: { id: data.saleId, organizationId }, select: { id: true, paidAmount: true } }),
    paymentId ? prisma.pharmacyPayment.findFirst({ where: { id: paymentId, organizationId, saleId: data.saleId } }) : null,
    cashSessionId ? prisma.pharmacyCashSession.findFirst({ where: { id: cashSessionId, organizationId, status: "OPEN" } }) : null,
    prisma.pharmacyRefund.aggregate({ where: { organizationId, saleId: data.saleId, status: { in: ["SUBMITTED", "VALIDATED", "PAID"] } }, _sum: { amount: true } }),
  ]);
  if (!sale) throw new Error("SALE_NOT_FOUND");
  if (paymentId && !payment) throw new Error("PAYMENT_NOT_FOUND");
  if (cashSessionId && !session) throw new Error("SESSION_NOT_OPEN");
  if (Number(aggregate._sum.amount || 0) + data.amount > Number(sale.paidAmount)) throw new Error("REFUND_EXCEEDS_PAID");
  if (data.restockItems && data.amount < Number(sale.paidAmount)) throw new Error("RESTOCK_REQUIRES_FULL_REFUND");
  return prisma.pharmacyRefund.create({ data: { organizationId, refundNumber: await generatePharmacyEntityNumber(organizationId, "REFUND"), saleId: data.saleId, paymentId, cashSessionId, refundType: data.refundType, amount: data.amount, currency: data.currency, reason: data.reason, restockItems: data.restockItems, status: cashSettings.refundRequiresValidation ? "SUBMITTED" : "VALIDATED", requestedById: userId, validatedById: cashSettings.refundRequiresValidation ? null : userId, validatedAt: cashSettings.refundRequiresValidation ? null : new Date(), notes: nil(data.notes) } });
}

export async function validateCashRefund(organizationId: string, refundId: string, userId: string) {
  return prisma.$transaction(async (transaction) => {
    const refund = await transaction.pharmacyRefund.findFirst({ where: { id: refundId, organizationId, status: "SUBMITTED" }, include: { sale: { include: { lines: true } } } });
    if (!refund) throw new Error("REFUND_NOT_SUBMITTED");
    if (refund.restockItems) {
      const previousRestock = await transaction.pharmacyRefund.findFirst({ where: { organizationId, saleId: refund.saleId, restockItems: true, status: { in: ["VALIDATED", "PAID"] }, id: { not: refund.id } }, select: { id: true } });
      if (previousRestock) throw new Error("SALE_ALREADY_RESTOCKED");
      for (const line of refund.sale.lines) {
        const batch = await transaction.pharmacyBatch.findFirst({ where: { id: line.batchId, organizationId, productId: line.productId } });
        if (!batch) throw new Error("BATCH_NOT_FOUND");
        const before = Number(batch.availableQuantity);
        const quantity = Number(line.quantity);
        await transaction.pharmacyBatch.update({ where: { id: batch.id }, data: { availableQuantity: before + quantity, status: batch.status === "DEPLETED" ? "ACTIVE" : batch.status, updatedById: userId } });
        await transaction.pharmacyStockMovement.create({ data: { organizationId, productId: line.productId, batchId: line.batchId, movementType: "RETURN_CUSTOMER", direction: "IN", quantity, quantityBefore: before, quantityAfter: before + quantity, reason: refund.reason, relatedEntityType: "PharmacyRefund", relatedEntityId: refund.id, createdById: userId } });
      }
    }
    const refundedAmount = Number(refund.sale.refundedAmount || 0) + Number(refund.amount);
    await transaction.pharmacySale.update({ where: { id: refund.saleId }, data: { refundedAmount, status: refundedAmount >= Number(refund.sale.paidAmount) ? "REFUNDED" : refund.sale.status, updatedById: userId } });
    return transaction.pharmacyRefund.update({ where: { id: refund.id }, data: { status: "VALIDATED", validatedById: userId, validatedAt: new Date() } });
  });
}

export async function closeCashSession(organizationId: string, cashSessionId: string, userId: string, countedCashAmount: number, justification?: string) {
  const cashSettings = (await getEffectivePharmacySettings(organizationId, userId)).sections["cash-payments"];
  const session = await prisma.pharmacyCashSession.findFirst({ where: { id: cashSessionId, organizationId, status: "OPEN" } });
  if (!session) throw new Error("SESSION_NOT_OPEN");
  const totals = await calculateCashSessionTotals(organizationId, cashSessionId);
  const varianceAmount = countedCashAmount - totals.theoreticalCashAmount;
  const absolute = Math.abs(varianceAmount);
  const criticalThreshold = Number(cashSettings.criticalCashVarianceThreshold); const varianceCriticity = absolute === 0 ? "LOW" : absolute <= 10 ? "MEDIUM" : absolute < criticalThreshold ? "HIGH" : "CRITICAL";
  if (cashSettings.cashVarianceRequiresJustification && absolute > 10 && !justification?.trim()) throw new Error("JUSTIFICATION_REQUIRED");
  return prisma.$transaction(async (transaction) => {
    const closed = await transaction.pharmacyCashSession.update({ where: { id: session.id }, data: { ...totals, countedCashAmount, varianceAmount, varianceCriticity, varianceJustification: justification || null, closedAt: new Date(), status: "CLOSED", updatedById: userId } });
    if (absolute > 0) await transaction.pharmacyCashDiscrepancy.create({ data: { organizationId, cashSessionId: session.id, cashierId: session.cashierId, discrepancyType: varianceAmount < 0 ? "CASH_SHORTAGE" : "CASH_SURPLUS", theoreticalAmount: totals.theoreticalCashAmount, countedAmount: countedCashAmount, varianceAmount, criticity: varianceCriticity, justification: justification || null, createdById: userId, updatedById: userId } });
    return closed;
  });
}

export async function getCashDataset(organizationId: string) {
  const [sessions, payments, invoices, receipts, refunds, discrepancies, sales, members, departments] = await Promise.all([
    prisma.pharmacyCashSession.findMany({ where: { organizationId }, orderBy: { openedAt: "desc" }, include: { discrepancies: true } }),
    prisma.pharmacyPayment.findMany({ where: { organizationId }, orderBy: { paymentDate: "desc" } }),
    prisma.pharmacyInvoice.findMany({ where: { organizationId }, orderBy: { invoiceDate: "desc" } }),
    prisma.pharmacyCashReceipt.findMany({ where: { organizationId }, orderBy: { generatedAt: "desc" } }),
    prisma.pharmacyRefund.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
    prisma.pharmacyCashDiscrepancy.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
    prisma.pharmacySale.findMany({ where: { organizationId, status: { notIn: ["CANCELLED", "REJECTED"] } }, orderBy: { saleDate: "desc" }, select: { id: true, saleNumber: true, customerName: true, totalAmount: true, paidAmount: true, remainingAmount: true, currency: true, paymentStatus: true, cashierId: true, cashSessionId: true, saleDate: true } }),
    prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", removedAt: null }, select: { user: { select: { id: true, name: true } } } }),
    prisma.enterpriseDepartment.findMany({ where: { organizationId, isActive: true }, select: { id: true, labelFr: true } }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const todayPayments = payments.filter((item) => item.paymentDate.toISOString().slice(0, 10) === today && activePaymentStatuses.includes(item.status));
  const sumMethod = (method: string) => todayPayments.filter((item) => item.paymentMethod === method).reduce((sum, item) => sum + Number(item.amount), 0);
  const metrics = { cashOpen: sessions.some((item) => item.status === "OPEN") ? 1 : 0, openSessions: sessions.filter((item) => item.status === "OPEN").length, paidSalesToday: sales.filter((item) => item.saleDate.toISOString().slice(0, 10) === today && item.paymentStatus === "PAID").length, paidToday: todayPayments.reduce((sum, item) => sum + Number(item.amount), 0), cash: sumMethod("CASH"), mobileMoney: sumMethod("MOBILE_MONEY"), card: sumMethod("CARD"), credit: sumMethod("CREDIT"), insurance: sumMethod("INSURANCE"), partialSales: sales.filter((item) => item.paymentStatus === "PARTIALLY_PAID").length, unpaidSales: sales.filter((item) => item.paymentStatus === "UNPAID").length, refundsToday: refunds.filter((item) => item.createdAt.toISOString().slice(0, 10) === today).reduce((sum, item) => sum + Number(item.amount), 0), invoices: invoices.length, receipts: receipts.length, openDiscrepancies: discrepancies.filter((item) => !["RESOLVED", "CANCELLED", "REJECTED"].includes(item.status)).length, pendingClosures: sessions.filter((item) => item.status === "PENDING_VALIDATION").length };
  return { metrics, sessions, payments, invoices, receipts, refunds, discrepancies, sales, members: members.map((item) => item.user), departments };
}
