import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseWorkflowAccess } from "@/lib/enterprise/workflows/access";
import { requireWorkflowSourceAccess } from "@/lib/enterprise/workflows/source-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
type Source = { id: string; title: string; reference?: string | null; status: string };

/**
 * Only canonical source types with tested tenant + actor queries are offered.
 * Do not construct Prisma delegate names from a request parameter.
 */
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseWorkflowAccess(session, organizationId);
  if (!access?.canStartManual) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const definitionId = new URL(req.url).searchParams.get("definitionId")?.trim();
  if (!definitionId || definitionId.length > 191) return NextResponse.json({ error: "WORKFLOW_DEFINITION_REQUIRED" }, { status: 400 });
  const definition = await prisma.enterpriseWorkflowDefinition.findFirst({
    where: { id: definitionId, organizationId, status: "ACTIVE", allowManualStart: true, archivedAt: null },
    select: { triggerEntityType: true, currentVersionId: true },
  });
  if (!definition?.triggerEntityType || !definition.currentVersionId) {
    return NextResponse.json({ error: "WORKFLOW_MANUAL_START_UNAVAILABLE", message: "Le workflow ne permet pas de lancement manuel." }, { status: 409 });
  }
  const published = await prisma.enterpriseWorkflowVersion.findFirst({
    where: { id: definition.currentVersionId, organizationId, definitionId, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!published) return NextResponse.json({ error: "WORKFLOW_NOT_PUBLISHED" }, { status: 409 });
  const type = definition.triggerEntityType;
  try {
    await requireWorkflowSourceAccess({ userId: session.userId, organizationId, sourceEntityType: type, action: "submit" });
  } catch {
    return NextResponse.json({ error: "WORKFLOW_SOURCE_ACCESS_DENIED" }, { status: 403 });
  }
  const userId = session.userId;
  const own = !access.canViewAllRuns;
  let sources: Source[];
  let emptyReason: "NO_RECORDS" | "NO_VISIBLE_RECORDS" | null = null;
  // These options are intentionally bounded and carry only identifiers and
  // business labels. Clinical, finance amounts and private descriptions remain server-side.
  switch (type) {
    case "EnterpriseTask": {
      const rows = await prisma.enterpriseTask.findMany({ where: { organizationId, archivedAt: null, ...(own ? { OR: [{ createdByUserId: userId }, { assignedToUserId: userId }] } : {}) }, select: { id: true, title: true, status: true }, orderBy: { updatedAt: "desc" }, take: 50 });
      sources = rows; break;
    }
    case "EnterpriseRequest": {
      const rows = await prisma.enterpriseRequest.findMany({ where: { organizationId, archivedAt: null, ...(own ? { OR: [{ requestedByUserId: userId }, { assignedToUserId: userId }] } : {}) }, select: { id: true, title: true, status: true }, orderBy: { updatedAt: "desc" }, take: 50 });
      sources = rows; break;
    }
    case "EnterpriseMeeting": {
      const rows = await prisma.enterpriseMeeting.findMany({ where: { organizationId, archivedAt: null, ...(own ? { organizerUserId: userId } : {}) }, select: { id: true, title: true, status: true }, orderBy: { updatedAt: "desc" }, take: 50 });
      sources = rows; break;
    }
    case "EnterprisePurchase": {
      const rows = await prisma.enterprisePurchase.findMany({ where: { organizationId, archivedAt: null, ...(own ? { OR: [{ requestedByUserId: userId }, { buyerUserId: userId }, { createdByUserId: userId }] } : {}) }, select: { id: true, title: true, reference: true, status: true }, orderBy: { createdAt: "desc" }, take: 50 });
      sources = rows; break;
    }
    case "EnterpriseBudget": {
      const rows = await prisma.enterpriseBudget.findMany({ where: { organizationId, archivedAt: null, status: { in: ["DRAFT", "PREPARING", "CORRECTION_REQUESTED", "PENDING_APPROVAL"] }, ...(own ? { OR: [{ ownerUserId: userId }, { createdByUserId: userId }] } : {}) }, select: { id: true, title: true, reference: true, status: true }, orderBy: { createdAt: "desc" }, take: 50 });
      sources = rows; break;
    }
    case "EnterpriseExpense": {
      const rows = await prisma.enterpriseExpense.findMany({ where: { organizationId, archivedAt: null, status: { in: ["DRAFT", "PENDING_APPROVAL"] }, ...(own ? { OR: [{ requestedByUserId: userId }, { createdByUserId: userId }] } : {}) }, select: { id: true, title: true, reference: true, status: true }, orderBy: { createdAt: "desc" }, take: 50 });
      sources = rows; break;
    }
    case "EnterpriseReport": {
      const rows = await prisma.enterpriseReport.findMany({ where: { organizationId, archivedAt: null, ...(own ? { generatedByUserId: userId } : {}) }, select: { id: true, title: true, reference: true, status: true }, orderBy: { createdAt: "desc" }, take: 50 });
      sources = rows; break;
    }
    case "EnterpriseSupplierInvoice": {
      const rows = await prisma.enterpriseSupplierInvoice.findMany({
        where: { organizationId, archivedAt: null,
          status: { in: ["PENDING_REVIEW", "PENDING_APPROVAL", "APPROVED"] },
          ...(own ? { createdByUserId: userId } : {}),
        },
        select: { id: true, number: true, status: true },
        orderBy: { createdAt: "desc" }, take: 50,
      });
      sources = rows.map((row) => ({ id: row.id, reference: row.number, title: "Facture fournisseur", status: row.status }));
      break;
    }
    case "EnterprisePayment": {
      const rows = await prisma.enterprisePayment.findMany({
        where: { organizationId, paymentType: "SUPPLIER_PAYMENT", status: { in: ["PENDING_APPROVAL", "APPROVED"] },
          ...(own ? { initiatedByUserId: userId } : {}) },
        select: { id: true, number: true, status: true },
        orderBy: { createdAt: "desc" }, take: 50,
      });
      sources = rows.map((row) => ({ id: row.id, reference: row.number, title: "Paiement fournisseur", status: row.status }));
      break;
    }
    case "EnterpriseCashSession": {
      const rows = await prisma.enterpriseCashSession.findMany({
        where: { organizationId, status: { in: ["PENDING_VALIDATION", "CLOSED", "REJECTED"] },
          ...(own ? { cashierUserId: userId } : {}) },
        select: { id: true, number: true, status: true },
        orderBy: { createdAt: "desc" }, take: 50,
      });
      sources = rows.map((row) => ({ id: row.id, reference: row.number, title: "Clôture de caisse", status: row.status }));
      break;
    }
    case "EnterpriseJournalEntry": {
      const rows = await prisma.enterpriseJournalEntry.findMany({
        where: { organizationId, status: { in: ["PENDING_APPROVAL", "APPROVED"] },
          ...(own ? { preparedByUserId: userId } : {}) },
        select: { id: true, number: true, status: true },
        orderBy: { createdAt: "desc" }, take: 50,
      });
      sources = rows.map((row) => ({ id: row.id, reference: row.number, title: "Écriture manuelle", status: row.status }));
      break;
    }
    case "EnterpriseFinancialClose": {
      const rows = await prisma.enterpriseFinancialClose.findMany({
        where: { organizationId, status: { in: ["PENDING_APPROVAL", "APPROVED"] },
          ...(own ? { requestedByUserId: userId } : {}) },
        select: { id: true, fiscalPeriod: { select: { code: true } }, status: true },
        orderBy: { createdAt: "desc" }, take: 50,
      });
      sources = rows.map((row) => ({ id: row.id, reference: row.fiscalPeriod.code, title: "Dossier de clôture", status: row.status }));
      break;
    }
    default:
      return NextResponse.json({ error: "WORKFLOW_MANUAL_SOURCE_NOT_SUPPORTED", message: "La sélection de cet objet métier n’est pas encore disponible." }, { status: 409 });
  }
  if (!sources.length) {
    // Never reveal whether other employees have private records.
    emptyReason = own ? "NO_VISIBLE_RECORDS" : "NO_RECORDS";
  }
  await writeApiLog({ request: req, statusCode: 200, userId, startedAt, metadata: { organizationId, domain: "workflow-source-options", type, count: sources.length } });
  return NextResponse.json({
    sourceEntityType: type, emptyReason,
    createModuleHref: type === "EnterpriseExpense" || type === "EnterpriseBudget" ? "/enterprise-modules/FINANCE_BUDGETS"
      : type === "EnterpriseSupplierInvoice" ? "/enterprise-modules/FINANCE_PAYABLES"
      : type === "EnterprisePayment" ? "/enterprise-modules/FINANCE_PAYMENTS"
      : type === "EnterpriseCashSession" ? "/enterprise-modules/FINANCE_CASH"
      : type === "EnterpriseJournalEntry" ? "/enterprise-modules/FINANCE_ACCOUNTING"
      : type === "EnterpriseFinancialClose" ? "/enterprise-modules/FINANCE_CLOSE" : null,
    sources: sources.map((item) => ({ id: item.id, label: [item.reference, item.title, item.status].filter(Boolean).join(" · ") })),
  });
}
