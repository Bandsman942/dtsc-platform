import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { overrideThreeWayMatch } from "@/lib/enterprise/accounting/payables-service";

const threeWayMatchOverrideSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
  revision: z.number().int().positive(),
}).strict();

type Params = { params: Promise<{ organizationId: string; invoiceId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_PAYABLES", "approve", { mutation: true, limit: 40 });
  if (!auth.ok) return auth.response;

  const parsed = threeWayMatchOverrideSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  try {
    const match = await overrideThreeWayMatch(organizationId, invoiceId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_THREE_WAY_MATCH_OVERRIDDEN",
      entity: "EnterpriseThreeWayMatch",
      entityId: match.id,
      request: req,
      metadata: { organizationId, invoiceId, reason: parsed.data.reason.slice(0, 500) },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "three-way-match", action: "override" } });
    return NextResponse.json({ ok: true, match });
  } catch (error) {
    return financeErrorResponse(error, "THREE_WAY_MATCH_OVERRIDE_FAILED");
  }
}
