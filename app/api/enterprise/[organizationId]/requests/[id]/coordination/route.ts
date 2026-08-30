import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import {
  applyRequestCoordinationAction,
  canCoordinateRequest,
  getRequestCoordinationContext,
  loadRequestCoordination,
  requestCoordinationActionSchema,
  RequestCoordinationError,
} from "@/lib/standard-work-coordination/request-coordination";
import { workCoordinationDeepLink } from "@/lib/standard-work-coordination/deep-links";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId, id } = await params;
  const context = await getRequestCoordinationContext({ session, organizationId, requestId: id, action: "read" });
  if (!context) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const coordination = await loadRequestCoordination(organizationId, id);
  const canOperate = context.canOperate || context.access.canManage;
  const canRequesterAct = context.isRequester || context.access.canManage;
  const capabilities = {
    canRequestInformation: canOperate && canCoordinateRequest("REQUEST_INFORMATION", context.request.status),
    canRespond: canRequesterAct && canCoordinateRequest("RESPOND", context.request.status),
    canResolve: canOperate && canCoordinateRequest("RESOLVE", context.request.status),
    canClose: canOperate && canCoordinateRequest("CLOSE", context.request.status),
    canReopen: canRequesterAct && canCoordinateRequest("REOPEN", context.request.status),
  };
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, requestId: id, domain: "request-coordination" } });
  return NextResponse.json({ request: context.request, coordination, capabilities });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `request-coordination:${session.userId}`), 180, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { organizationId, id } = await params;
  const context = await getRequestCoordinationContext({ session, organizationId, requestId: id, action: "write" });
  if (!context) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const parsed = requestCoordinationActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Action invalide." }, { status: 400 });
  try {
    const requestRecord = await applyRequestCoordinationAction({ organizationId, requestId: id, actorUserId: session.userId, canManage: context.access.canManage, canOperate: context.canOperate, isRequester: context.isRequester, payload: parsed.data });
    if (!requestRecord) throw new RequestCoordinationError("NOT_FOUND", 404, "Demande introuvable après la mutation.");
    const coordination = await loadRequestCoordination(organizationId, id);
    const recipientId = parsed.data.action === "REQUEST_INFORMATION" || parsed.data.action === "RESOLVE" || parsed.data.action === "CLOSE" ? context.request.requestedByUserId : context.request.assignedToUserId;
    if (recipientId && recipientId !== session.userId) await notifyUser({ userId: recipientId, organizationId, type: "ENTERPRISE_REQUEST", title: requestTitle(parsed.data.action), body: parsed.data.comment || context.request.title, targetUrl: workCoordinationDeepLink("REQUEST", id) });
    await writeAuditLog({ userId: session.userId, action: `ENTERPRISE_REQUEST_${parsed.data.action}`, entity: "EnterpriseRequest", entityId: id, request: req, metadata: { organizationId, fromStatus: context.request.status, toStatus: requestRecord.status, revision: parsed.data.revision } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, requestId: id, action: parsed.data.action, domain: "request-coordination" } });
    return NextResponse.json({ ok: true, request: requestRecord, coordination });
  } catch (error) {
    const known = error instanceof RequestCoordinationError ? error : null;
    const status = known?.status || 500;
    const code = known?.code || "INTERNAL_ERROR";
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { organizationId, requestId: id, action: parsed.data.action, code } });
    return NextResponse.json({ error: code, message: known?.message || "L’action sur la demande a échoué." }, { status });
  }
}

function requestTitle(action: string) {
  if (action === "REQUEST_INFORMATION") return "Informations demandées";
  if (action === "RESPOND") return "Réponse reçue";
  if (action === "RESOLVE") return "Demande traitée";
  if (action === "CLOSE") return "Traitement clôturé";
  return "Demande rouverte";
}
