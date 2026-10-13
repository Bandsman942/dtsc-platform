import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireConsoleCapability } from "@/lib/admin-api";
import { writeAuditLog } from "@/lib/audit";
import { aiAlertRuleSchema } from "@/lib/ai/governance-alerts";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Origine non autorisée", reasonCode: "ORIGIN_FORBIDDEN" }, { status: 403 });
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.AI_MANAGE);
  if (access.response) return access.response;

  const limit = await rateLimit(`ai-alert-rule:${access.session.userId}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: "Trop de modifications récentes", reasonCode: "RATE_LIMITED" }, { status: 429 });

  const parsed = aiAlertRuleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Règle d'alerte invalide", reasonCode: "VALIDATION_ERROR" }, { status: 400 });
  const { code, enabled, severity, threshold, expectedRevision, reason } = parsed.data;
  const requestId = request.headers.get("x-request-id")?.slice(0, 120) || null;
  try {
    const revision = await prisma.$transaction(async (tx) => {
      const prior = await tx.aiGovernanceAlertRule.findUnique({ where: { code } });
      if ((prior?.revision || 0) !== expectedRevision) throw new Error("REVISION_CONFLICT");
      const data = { enabled, severity, threshold, reason, updatedByUserId: access.session.userId };
      if (prior) {
        const updated = await tx.aiGovernanceAlertRule.updateMany({
          where: { code, revision: expectedRevision },
          data: { ...data, revision: { increment: 1 } },
        });
        if (updated.count !== 1) throw new Error("REVISION_CONFLICT");
      } else {
        await tx.aiGovernanceAlertRule.create({ data: { code, revision: 1, ...data } });
      }
      await tx.platformSettingHistory.create({
        data: {
          settingCode: `AI_ALERT_${code}`,
          category: "AI",
          valueType: "OBJECT",
          previousValue: prior ? { enabled: prior.enabled, severity: prior.severity, threshold: prior.threshold, revision: prior.revision } : Prisma.JsonNull,
          nextValue: { enabled, severity, threshold, revision: expectedRevision + 1 },
          sensitive: false,
          environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "PRODUCTION",
          effect: enabled ? "AI_ALERT_RULE_PUBLISHED" : "AI_ALERT_RULE_DISABLED",
          restartRequired: false,
          reason,
          actorUserId: access.session.userId,
          requestId,
        },
      });
      return expectedRevision + 1;
    });
    await writeAuditLog({
      request, requestId, userId: access.session.userId,
      entity: "AiGovernanceAlertRule", entityId: code,
      action: enabled ? "AI_ALERT_RULE_PUBLISHED" : "AI_ALERT_RULE_DISABLED",
      riskLevel: "HIGH", reasonCode: "AI_ALERT_POLICY_CHANGED",
      before: { revision: expectedRevision }, after: { enabled, severity, threshold, revision },
      metadata: { reason },
    });
    return NextResponse.json({ ok: true, code, enabled, severity, threshold, revision });
  } catch (error) {
    if ((error instanceof Error && error.message === "REVISION_CONFLICT") || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      return NextResponse.json({ error: "La règle a été modifiée. Actualisez puis recommencez.", reasonCode: "REVISION_CONFLICT" }, { status: 409 });
    }
    return NextResponse.json({ error: "Modification de la règle non confirmée", reasonCode: "AI_ALERT_UPDATE_FAILED" }, { status: 503 });
  }
}
