import { NextResponse } from "next/server";
import { z } from "zod";
import { requireConsoleCapability } from "@/lib/admin-api";
import { writeAuditLog } from "@/lib/audit";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { processStoredWebhookEvent } from "@/lib/console/console-webhooks";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const schema = z.object({ reason: z.string().trim().min(3).max(500) });
type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden", reasonCode: "ORIGIN_FORBIDDEN" }, { status: 403 });
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.WEBHOOK_RETRY);
  if (access.response) return access.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid retry request", reasonCode: "VALIDATION_ERROR" }, { status: 400 });
  const limited = await rateLimit(getRateLimitKey(req, `webhook-retry:${access.session.userId}`), 20, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", reasonCode: "RATE_LIMITED" }, { status: 429 });
  const { id } = await params;
  const before = await prisma.webhookEvent.findUnique({ where: { id }, select: { id: true, provider: true, eventType: true, status: true, attempts: true, appliedAt: true } });
  if (!before) return NextResponse.json({ error: "Not found", reasonCode: "NOT_FOUND" }, { status: 404 });
  const result = await processStoredWebhookEvent(id, { manual: true });
  await writeAuditLog({ userId: access.session.userId, action: result.ok ? "CONSOLE_WEBHOOK_RETRY_APPLIED" : "CONSOLE_WEBHOOK_RETRY_REJECTED", entity: "WebhookEvent", entityId: id, result: result.ok ? "SUCCESS" : "DENIED", before, after: { ok: result.ok, reasonCode: result.reasonCode }, reasonCode: result.reasonCode, riskLevel: "HIGH", metadata: { reason: parsed.data.reason, provider: before.provider, eventType: before.eventType }, request: req });
  return NextResponse.json({ ok: result.ok, result, reasonCode: result.reasonCode }, { status: result.ok ? 200 : result.reasonCode === "WEBHOOK_ALREADY_APPLIED" ? 409 : 422 });
}
