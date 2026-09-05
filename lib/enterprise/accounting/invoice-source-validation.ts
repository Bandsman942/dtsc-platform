import type { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

export async function assertSalesInvoiceSources(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: {
    businessPartyId: string;
    currencyCode: string;
    salesOrderId?: string | null;
    fulfillmentId?: string | null;
    contractId?: string | null;
    projectId?: string | null;
  },
) {
  if (input.fulfillmentId && !input.salesOrderId) throw new EnterpriseAccountingError("SALES_INVOICE_FULFILLMENT_ORDER_REQUIRED", 409);

  if (input.salesOrderId) {
    const order = await tx.enterpriseSalesOrder.findFirst({
      where: {
        id: input.salesOrderId,
        organizationId,
        businessPartyId: input.businessPartyId,
        status: { in: ["CONFIRMED", "PARTIALLY_FULFILLED", "FULFILLED", "CLOSED"] },
      },
      select: { id: true, currency: true },
    });
    if (!order) throw new EnterpriseAccountingError("SALES_ORDER_NOT_INVOICEABLE", 409);
    if (order.currency && order.currency !== input.currencyCode) throw new EnterpriseAccountingError("SALES_INVOICE_ORDER_CURRENCY_MISMATCH", 409);
  }

  if (input.fulfillmentId) {
    const fulfillment = await tx.enterpriseFulfillment.findFirst({
      where: {
        id: input.fulfillmentId,
        organizationId,
        salesOrderId: input.salesOrderId || undefined,
        status: { in: ["FULFILLED", "ACCEPTED", "COMPLETED"] },
      },
      select: { id: true },
    });
    if (!fulfillment) throw new EnterpriseAccountingError("SALES_INVOICE_FULFILLMENT_INVALID", 409);
  }

  if (input.contractId) {
    const contract = await tx.enterpriseContract.findFirst({
      where: {
        id: input.contractId,
        organizationId,
        businessPartyId: input.businessPartyId,
        archivedAt: null,
        status: { in: ["APPROVED", "ACTIVE"] },
      },
      select: { id: true, currency: true },
    });
    if (!contract) throw new EnterpriseAccountingError("SALES_INVOICE_CONTRACT_INVALID", 409);
    if (contract.currency && contract.currency !== input.currencyCode) throw new EnterpriseAccountingError("SALES_INVOICE_CONTRACT_CURRENCY_MISMATCH", 409);
  }

  if (input.projectId) {
    const project = await tx.enterpriseProject.findFirst({
      where: { id: input.projectId, organizationId, archivedAt: null, status: { notIn: ["CANCELLED", "ARCHIVED"] } },
      select: { id: true },
    });
    if (!project) throw new EnterpriseAccountingError("SALES_INVOICE_PROJECT_INVALID", 409);
  }
}

export async function assertSupplierInvoiceSources(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: {
    supplierId: string;
    currencyCode: string;
    purchaseId?: string | null;
    purchaseReceiptId?: string | null;
    projectId?: string | null;
    assetId?: string | null;
  },
) {
  if (input.purchaseReceiptId && !input.purchaseId) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_RECEIPT_PURCHASE_REQUIRED", 409);

  if (input.purchaseId) {
    const purchase = await tx.enterprisePurchase.findFirst({
      where: { id: input.purchaseId, organizationId, supplierId: input.supplierId, archivedAt: null, status: { notIn: ["CANCELLED", "REJECTED"] } },
      select: { id: true, currency: true },
    });
    if (!purchase) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_PURCHASE_INVALID", 409);
    if (purchase.currency !== input.currencyCode) throw new EnterpriseAccountingError("THREE_WAY_MATCH_CURRENCY_MISMATCH", 409);
  }

  if (input.purchaseReceiptId) {
    const receipt = await tx.enterprisePurchaseReceipt.findFirst({
      where: { id: input.purchaseReceiptId, organizationId, purchaseId: input.purchaseId || undefined },
      select: { id: true },
    });
    if (!receipt) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_RECEIPT_INVALID", 409);
  }

  if (input.projectId) {
    const project = await tx.enterpriseProject.findFirst({
      where: { id: input.projectId, organizationId, archivedAt: null, status: { notIn: ["CANCELLED", "ARCHIVED"] } },
      select: { id: true },
    });
    if (!project) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_PROJECT_INVALID", 409);
  }

  if (input.assetId) {
    const asset = await tx.enterpriseAsset.findFirst({
      where: { id: input.assetId, organizationId, archivedAt: null, status: { notIn: ["DISPOSED", "ARCHIVED", "CANCELLED"] } },
      select: { id: true, supplierId: true, purchaseId: true, currency: true },
    });
    if (!asset) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_ASSET_INVALID", 409);
    if (asset.supplierId && asset.supplierId !== input.supplierId) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_ASSET_SUPPLIER_MISMATCH", 409);
    if (input.purchaseId && asset.purchaseId && asset.purchaseId !== input.purchaseId) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_ASSET_PURCHASE_MISMATCH", 409);
    if (asset.currency && asset.currency !== input.currencyCode) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_ASSET_CURRENCY_MISMATCH", 409);
  }
}
