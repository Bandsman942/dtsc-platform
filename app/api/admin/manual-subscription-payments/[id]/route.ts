import { z } from "zod";
import { NextResponse } from "next/server";
import { requireConsoleCapability } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { isDtscInternalSession } from "@/lib/organizations";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { finalizeManualSubscriptionPayment } from "@/lib/subscription-payments";

const schema = z.object({ action: z.enum(["APPROVE", "REJECT"]), validationComment: z.string().trim().max(500).optional() });
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SUBSCRIPTIONS_READ);
  if (access.response) return access.response;
  if (!isDtscInternalSession(access.session)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `manual-subscription-payment-decision:${access.session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  const { id } = await params;
  try {
    const result = await finalizeManualSubscriptionPayment(id, { userId: access.session.userId, role: access.session.role }, parsed.data.action, parsed.data.validationComment);
    await writeAuditLog({ userId: access.session.userId, action: `MANUAL_SUBSCRIPTION_PAYMENT_${parsed.data.action}D`, entity: "ManualSubscriptionPayment", entityId: id, request: req, metadata: { validationComment: parsed.data.validationComment || null } });
    await writeApiLog({ request: req, statusCode: 200, userId: access.session.userId, startedAt });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code.includes("NOT_FOUND") ? 404 : code.includes("REQUIRED") ? 403 : code.includes("ALREADY") ? 409 : 500;
    await writeApiLog({ request: req, statusCode: status, userId: access.session.userId, startedAt, metadata: { code } });
    return NextResponse.json({ error: code, message: status === 500 ? "Impossible de finaliser ce paiement manuel." : "Cette décision ne peut pas être appliquée." }, { status });
  }
}
