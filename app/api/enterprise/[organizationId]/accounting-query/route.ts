import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import {
  getAccountingAnomalies,
  getAccountingEntryTrace,
  getAccountingGeneralLedger,
  getAccountingTrialBalance,
  type AccountingQueryFilters,
} from "@/lib/enterprise/accounting/accounting-query-service";
import { resolveAccountingSourceLink } from "@/lib/enterprise/accounting/accounting-source-link-registry";
import { serializeFinanceValue } from "@/lib/enterprise/accounting/helpers";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
type View = "general-ledger" | "trial-balance" | "entry-trace" | "anomalies";

const VIEWS = new Set<View>(["general-ledger", "trial-balance", "entry-trace", "anomalies"]);

function dateParam(url: URL, name: string) {
  const raw = url.searchParams.get(name)?.trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function positiveInt(raw: string | null, fallback: number, max: number) {
  const parsed = Number(raw || fallback);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function queryFilters(url: URL): AccountingQueryFilters {
  return {
    page: positiveInt(url.searchParams.get("page"), 1, 1_000_000),
    pageSize: positiveInt(url.searchParams.get("pageSize"), 25, 100),
    search: url.searchParams.get("search")?.trim() || undefined,
    dateFrom: dateParam(url, "dateFrom"),
    dateTo: dateParam(url, "dateTo"),
    fiscalPeriodId: url.searchParams.get("fiscalPeriodId")?.trim() || undefined,
    ledgerAccountId: url.searchParams.get("ledgerAccountId")?.trim() || undefined,
    journalId: url.searchParams.get("journalId")?.trim() || undefined,
    businessPartyId: url.searchParams.get("businessPartyId")?.trim() || undefined,
    projectId: url.searchParams.get("projectId")?.trim() || undefined,
    departmentId: url.searchParams.get("departmentId")?.trim() || undefined,
    siteId: url.searchParams.get("siteId")?.trim() || undefined,
    sourceModule: url.searchParams.get("sourceModule")?.trim() || undefined,
    sourceEntityType: url.searchParams.get("sourceEntityType")?.trim() || undefined,
    currencyCode: url.searchParams.get("currencyCode")?.trim().toUpperCase() || undefined,
    status: url.searchParams.get("status")?.trim().toUpperCase() || undefined,
  };
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const view = (url.searchParams.get("view") || "general-ledger") as View;
  if (!VIEWS.has(view)) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "Vue comptable inconnue." }, { status: 400 });
  }

  try {
    const filters = queryFilters(url);
    let data: unknown;

    if (view === "general-ledger") {
      data = await getAccountingGeneralLedger(prisma, organizationId, filters);
    } else if (view === "trial-balance") {
      data = await getAccountingTrialBalance(prisma, organizationId, filters);
    } else if (view === "anomalies") {
      data = await getAccountingAnomalies(prisma, organizationId, filters);
    } else {
      const entryId = url.searchParams.get("entryId")?.trim();
      if (!entryId) {
        return NextResponse.json({ error: "VALIDATION_ERROR", message: "Sélectionnez une écriture à consulter." }, { status: 400 });
      }
      const entry = await getAccountingEntryTrace(prisma, organizationId, entryId);
      if (!entry) {
        return NextResponse.json({ error: "NOT_FOUND", message: "Cette écriture comptable est introuvable." }, { status: 404 });
      }
      const sourceLink = await resolveAccountingSourceLink({
        userId: auth.session.userId,
        organizationId,
        sourceModule: entry.sourceModule,
        sourceEntityId: entry.sourceEntityId,
        reference: entry.reference,
      });
      data = { entry, sourceLink };
    }

    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "accounting-query", view },
    });
    return NextResponse.json(serializeFinanceValue(data));
  } catch (error) {
    return financeErrorResponse(error, "ACCOUNTING_QUERY_FAILED");
  }
}
