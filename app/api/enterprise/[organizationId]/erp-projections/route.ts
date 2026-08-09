import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { listCrossModuleProjections } from "@/lib/enterprise/cross-module/projection-service";

export const runtime = "nodejs";

type Params = { params: Promise<{ organizationId: string }> };
const STATUSES = new Set(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "DEAD"]);

function clientSafeProjectionMessage(code: string | null, status: string) {
  if (status === "COMPLETED") return null;
  if (status === "PENDING" || status === "PROCESSING") return "La synchronisation inter-module est en cours.";
  if (code === "PROJECTION_DEFINITION_NOT_FOUND") return "Cette synchronisation ne peut plus être traitée automatiquement.";
  if (code?.endsWith("_NOT_FOUND") || code?.endsWith("_MISSING")) return "Une donnée métier nécessaire à la synchronisation est indisponible.";
  if (status === "DEAD") return "La synchronisation a épuisé ses tentatives automatiques et nécessite une relance contrôlée par un utilisateur autorisé.";
  return "La synchronisation inter-module a échoué et peut être relancée par un utilisateur autorisé.";
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_OVERVIEW", "view");
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || 25) || 25));
  const requestedStatus = url.searchParams.get("status")?.trim().toUpperCase();
  const status = requestedStatus && STATUSES.has(requestedStatus) ? requestedStatus : undefined;
  const eventType = url.searchParams.get("eventType")?.trim().slice(0, 120) || undefined;
  try {
    const result = await listCrossModuleProjections(organizationId, { page, pageSize, status, eventType });
    const clientResult = {
      ...result,
      items: result.items.map((item) => ({
        id: item.id,
        eventType: item.eventType,
        sourceEntityType: item.sourceEntityType,
        sourceEntityId: item.sourceEntityId,
        targetModule: item.targetModule,
        targetEntityType: item.targetEntityType,
        targetEntityId: item.targetEntityId,
        status: item.status,
        attemptCount: item.attemptCount,
        updatedAt: item.updatedAt,
        lastErrorMessage: clientSafeProjectionMessage(item.lastErrorCode, item.status),
        sourceDeepLink: item.sourceDeepLink,
        targetDeepLink: item.targetDeepLink,
        retryable: item.status === "FAILED" || item.status === "DEAD",
      })),
    };
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "erp-cross-module-projections", page, status: status || "ALL" },
    });
    return NextResponse.json(clientResult);
  } catch (error) {
    return financeErrorResponse(error, "ERP_CROSS_MODULE_PROJECTIONS_READ_FAILED");
  }
}
