import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { retailDailyCloseDecisionSchema } from "@/lib/enterprise/retail/schemas";
import { decideRetailDailyClose } from "@/lib/enterprise/retail/service";

type Params = { params: Promise<{ organizationId: string; closeId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, closeId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_DAILY_CLOSE", "manage", { mutation: true, limit: 40 });
  if (!auth.ok) return auth.response;
  const parsed = retailDailyCloseDecisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Décision invalide." }, { status: 400 });
  try {
    const close = await decideRetailDailyClose(organizationId, closeId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: parsed.data.decision === "APPROVE" ? "ENTERPRISE_RETAIL_DAILY_CLOSE_APPROVED" : "ENTERPRISE_RETAIL_DAILY_CLOSE_REJECTED", entity: "EnterpriseRetailDailyClose", entityId: close.id, request: req, metadata: { organizationId, number: close.number, decision: parsed.data.decision, reason: parsed.data.reason?.slice(0, 500) || null } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-daily-close", action: parsed.data.decision.toLowerCase() } });
    return NextResponse.json({ ok: true, close });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_DAILY_CLOSE_DECISION_FAILED");
  }
}
