import type { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

export async function assertSalesInvoiceSources(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: {
    businessPartyId: string;
    salesOrderId?: string | null;
    fulfillmentId?: string | null;
    contractId?: string | null;
    projectId?: string | null;
  },
) {
  if (input.fulfillmentId && !input.salesOrderId) throw new EnterpriseAccountingError("SALES_INVOICE_FULFILLMENT_ORDER_REQUIRED", 409);

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
      select: { id: true },
    });
    if (!contract) throw new EnterpriseAccountingError("SALES_INVOICE_CONTRACT_INVALID", 409);
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
    purchaseId?: string | null;
    purchaseReceiptId?: string | null;
    projectId?: string | null;
    assetId?: string | null;
  },
) {
  if (input.purchaseReceiptId && !input.purchaseId) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_RECEIPT_PURCHASE_REQUIRED", 409);

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
      select: { id: true, supplierId: true, purchaseId: true },
    });
    if (!asset) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_ASSET_INVALID", 409);
    if (asset.supplierId && asset.supplierId !== input.supplierId) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_ASSET_SUPPLIER_MISMATCH", 409);
    if (input.purchaseId && asset.purchaseId && asset.purchaseId !== input.purchaseId) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_ASSET_PURCHASE_MISMATCH", 409);
  }
}
