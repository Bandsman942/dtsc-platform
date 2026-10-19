import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseWorkflowAccess } from "@/lib/enterprise/workflows/access";
import { requireWorkflowSourceAccess } from "@/lib/enterprise/workflows/source-access";
import { prisma } from "@/lib/prisma";
import { findWorkflowManualSources } from "@/lib/enterprise/workflows/manual-source-options";

type Params = { params: Promise<{ organizationId: string }> };

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
  // The same allow-listed ERP queries power the picker and POST authorization.
  // Only a supervisor allowed to view all runs may distinguish no records from
  // records in inadmissible states; never disclose a colleague's private data.
  const sources = await findWorkflowManualSources({
    organizationId, userId, entityType: type, allowAll: access.canViewAllRuns,
  });
  if (sources === null) {
    return NextResponse.json({ error: "WORKFLOW_MANUAL_SOURCE_NOT_SUPPORTED", message: "La sélection de cet objet métier n’est pas encore disponible." }, { status: 409 });
  }
  let emptyReason: "NO_RECORDS" | "NO_ELIGIBLE_RECORDS" | "NO_VISIBLE_RECORDS" | null = null;
  if (!sources.length) {
    const visibleIncludingOtherStates = await findWorkflowManualSources({
      organizationId, userId, entityType: type,
      allowAll: access.canViewAllRuns, includeIneligibleStatus: true,
    });
    // An employee may diagnose their OWN ineligible records, never the
    // presence of another employee's private records.
    emptyReason = visibleIncludingOtherStates?.length
      ? "NO_ELIGIBLE_RECORDS"
      : own ? "NO_VISIBLE_RECORDS" : "NO_RECORDS";
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
    sources: sources.map((item) => ({ id: item.id, label: [item.reference, item.title].filter(Boolean).join(" · "), status: item.status })),
  });
}
