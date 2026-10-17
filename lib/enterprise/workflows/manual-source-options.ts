import { prisma } from "@/lib/prisma";

/**
 * One allow-listed query per canonical ERP source. The manual-start picker and
 * POST authorization both use this module, so they cannot disagree on status,
 * source type, tenant, owner visibility or supplier-payment subtype.
 * includeIneligibleStatus is ONLY for an already-authorized supervisor's
 * empty-state diagnosis. Never return these records to the caller's browser.
 */
export type WorkflowManualSource = {
  id: string;
  title: string;
  reference?: string | null;
  status: string;
};

type WorkflowManualSourceQuery = {
  organizationId: string;
  userId: string;
  entityType: string;
  allowAll: boolean;
  sourceEntityId?: string;
  includeIneligibleStatus?: boolean;
};

export async function findWorkflowManualSources({
  organizationId, userId, entityType, allowAll, sourceEntityId, includeIneligibleStatus = false,
}: WorkflowManualSourceQuery): Promise<WorkflowManualSource[] | null> {
  const own = !allowAll;
  const byId = sourceEntityId ? { id: sourceEntityId } : {};
  const take = sourceEntityId ? 1 : 50;
  switch (entityType) {
    case "EnterpriseTask": {
      const rows = await prisma.enterpriseTask.findMany({
        where: { organizationId, ...byId, archivedAt: null, ...(own ? { OR: [{ createdByUserId: userId }, { assignedToUserId: userId }] } : {}) },
        select: { id: true, title: true, status: true },
        orderBy: { updatedAt: "desc" }, take,
      });
      return rows.map((row) => row);
    }
    case "EnterpriseRequest": {
      const rows = await prisma.enterpriseRequest.findMany({
        where: { organizationId, ...byId, archivedAt: null, ...(own ? { OR: [{ requestedByUserId: userId }, { assignedToUserId: userId }] } : {}) },
        select: { id: true, title: true, status: true },
        orderBy: { updatedAt: "desc" }, take,
      });
      return rows.map((row) => row);
    }
    case "EnterpriseMeeting": {
      const rows = await prisma.enterpriseMeeting.findMany({
        where: { organizationId, ...byId, archivedAt: null, ...(own ? { organizerUserId: userId } : {}) },
        select: { id: true, title: true, status: true },
        orderBy: { updatedAt: "desc" }, take,
      });
      return rows.map((row) => row);
    }
    case "EnterprisePurchase": {
      const rows = await prisma.enterprisePurchase.findMany({
        where: { organizationId, ...byId, archivedAt: null, ...(own ? { OR: [{ requestedByUserId: userId }, { buyerUserId: userId }, { createdByUserId: userId }] } : {}) },
        select: { id: true, title: true, reference: true, status: true },
        orderBy: { createdAt: "desc" }, take,
      });
      return rows.map((row) => row);
    }
    case "EnterpriseBudget": {
      const rows = await prisma.enterpriseBudget.findMany({
        where: { organizationId, ...byId, archivedAt: null, ...(includeIneligibleStatus ? {} : { status: { in: ["DRAFT","PREPARING","CORRECTION_REQUESTED","PENDING_APPROVAL"] } }), ...(own ? { OR: [{ ownerUserId: userId }, { createdByUserId: userId }] } : {}) },
        select: { id: true, title: true, reference: true, status: true },
        orderBy: { createdAt: "desc" }, take,
      });
      return rows.map((row) => row);
    }
    case "EnterpriseExpense": {
      const rows = await prisma.enterpriseExpense.findMany({
        where: { organizationId, ...byId, archivedAt: null, ...(includeIneligibleStatus ? {} : { status: { in: ["DRAFT","PENDING_APPROVAL"] } }), ...(own ? { OR: [{ requestedByUserId: userId }, { createdByUserId: userId }] } : {}) },
        select: { id: true, title: true, reference: true, status: true },
        orderBy: { createdAt: "desc" }, take,
      });
      return rows.map((row) => row);
    }
    case "EnterpriseReport": {
      const rows = await prisma.enterpriseReport.findMany({
        where: { organizationId, ...byId, archivedAt: null, ...(own ? { generatedByUserId: userId } : {}) },
        select: { id: true, title: true, reference: true, status: true },
        orderBy: { createdAt: "desc" }, take,
      });
      return rows.map((row) => row);
    }
    case "EnterpriseSupplierInvoice": {
      const rows = await prisma.enterpriseSupplierInvoice.findMany({
        where: { organizationId, ...byId, archivedAt: null, ...(includeIneligibleStatus ? {} : { status: { in: ["PENDING_REVIEW","PENDING_APPROVAL","APPROVED"] } }), ...(own ? { createdByUserId: userId } : {}) },
        select: { id: true, number: true, status: true },
        orderBy: { createdAt: "desc" }, take,
      });
      return rows.map((row) => ({ id: row.id, reference: row.number, title: "Facture fournisseur", status: row.status }));
    }
    case "EnterprisePayment": {
      const rows = await prisma.enterprisePayment.findMany({
        where: { organizationId, ...byId, paymentType: "SUPPLIER_PAYMENT", ...(includeIneligibleStatus ? {} : { status: { in: ["PENDING_APPROVAL","APPROVED"] } }), ...(own ? { initiatedByUserId: userId } : {}) },
        select: { id: true, number: true, status: true },
        orderBy: { createdAt: "desc" }, take,
      });
      return rows.map((row) => ({ id: row.id, reference: row.number, title: "Paiement fournisseur", status: row.status }));
    }
    case "EnterpriseCashSession": {
      const rows = await prisma.enterpriseCashSession.findMany({
        where: { organizationId, ...byId, ...(includeIneligibleStatus ? {} : { status: { in: ["PENDING_VALIDATION","CLOSED","REJECTED"] } }), ...(own ? { cashierUserId: userId } : {}) },
        select: { id: true, number: true, status: true },
        orderBy: { createdAt: "desc" }, take,
      });
      return rows.map((row) => ({ id: row.id, reference: row.number, title: "Clôture de caisse", status: row.status }));
    }
    case "EnterpriseJournalEntry": {
      const rows = await prisma.enterpriseJournalEntry.findMany({
        where: { organizationId, ...byId, ...(includeIneligibleStatus ? {} : { status: { in: ["PENDING_APPROVAL","APPROVED"] } }), ...(own ? { preparedByUserId: userId } : {}) },
        select: { id: true, number: true, status: true },
        orderBy: { createdAt: "desc" }, take,
      });
      return rows.map((row) => ({ id: row.id, reference: row.number, title: "Écriture manuelle", status: row.status }));
    }
    case "EnterpriseFinancialClose": {
      const rows = await prisma.enterpriseFinancialClose.findMany({
        where: { organizationId, ...byId, ...(includeIneligibleStatus ? {} : { status: { in: ["PENDING_APPROVAL","APPROVED"] } }), ...(own ? { requestedByUserId: userId } : {}) },
        select: { id: true, fiscalPeriod: { select: { code: true } }, status: true },
        orderBy: { createdAt: "desc" }, take,
      });
      return rows.map((row) => ({ id: row.id, reference: row.fiscalPeriod.code, title: "Dossier de clôture", status: row.status }));
    }
    default:
      return null;
  }
}
