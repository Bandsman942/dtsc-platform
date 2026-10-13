import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireConsoleCapability } from "@/lib/admin-api";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { getMcpServerDefinition } from "@/lib/ai/mcp/registry";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { isSameOriginRequest } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  serverCode: z.string().regex(/^[A-Z0-9_]{3,80}$/),
  expectedRevision: z.number().int().min(0),
  suspended: z.boolean(),
  reason: z.string().trim().min(8).max(500),
}).strict();

/** Restrictive kill switch only: the console cannot certify unknown servers,
 * approve changed schemas, grant OAuth scopes or enable tool bindings.
 */
export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({
    error: "Origine non autorisée", reasonCode: "ORIGIN_FORBIDDEN",
  }, { status: 403 });
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.MCP_MANAGE);
  if (access.response) return access.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({
    error: "Paramètres MCP invalides", reasonCode: "VALIDATION_ERROR",
  }, { status: 400 });
  const { serverCode, expectedRevision, suspended, reason } = parsed.data;
  const server = getMcpServerDefinition(serverCode);
  if (!server) return NextResponse.json({
    error: "Serveur MCP absent du registre certifié DTSC", reasonCode: "MCP_SERVER_UNKNOWN",
  }, { status: 404 });
  const requestId = request.headers.get("x-request-id")?.slice(0,120) || null;
  try {
    const revision = await prisma.$transaction(async (tx) => {
      const old = await tx.aiMcpControlState.findUnique({ where: { serverCode } });
      if ((old?.revision || 0) !== expectedRevision) throw new Error("MCP_CONTROL_REVISION_CONFLICT");
      const data = { suspended, reason, updatedByUserId: access.session.userId };
      if (old) {
        const applied = await tx.aiMcpControlState.updateMany({
          where: { serverCode, revision: expectedRevision },
          data: { ...data, revision: { increment: 1 } },
        });
        if (applied.count !== 1) throw new Error("MCP_CONTROL_REVISION_CONFLICT");
      } else {
        await tx.aiMcpControlState.create({ data: { serverCode, revision: 1, ...data } });
      }
      await tx.platformSettingHistory.create({
        data: {
          settingCode: `AI_MCP_SERVER_${serverCode}`,
          category: "AI",
          valueType: "OBJECT",
          previousValue: old ? { suspended: old.suspended, revision: old.revision } : Prisma.JsonNull,
          nextValue: { suspended, revision: expectedRevision + 1 },
          sensitive: false,
          environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "PRODUCTION",
          effect: suspended ? "MCP_SERVER_SUSPENDED" : "MCP_SERVER_RESUMED",
          restartRequired: false,
          reason,
          actorUserId: access.session.userId,
          requestId,
        },
      });
      return expectedRevision + 1;
    });
    await writeAuditLog({
      userId: access.session.userId,
      action: suspended ? "MCP_SERVER_SUSPENDED" : "MCP_SERVER_RESUMED",
      entity: "AiMcpControlState", entityId: serverCode, riskLevel: "HIGH",
      reasonCode: "MCP_CONTROL_UPDATED", requestId,
      before: { revision: expectedRevision },
      after: { revision, suspended },
      metadata: { reason }, request,
    });
    return NextResponse.json({ ok: true, serverCode, suspended, revision });
  } catch (error) {
    if ((error instanceof Error && error.message === "MCP_CONTROL_REVISION_CONFLICT")
      || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      return NextResponse.json({ error: "Le serveur a été modifié entre-temps. Actualisez la page.", reasonCode: "REVISION_CONFLICT" }, { status: 409 });
    }
    return NextResponse.json({ error: "Modification MCP non confirmée, vérifiez l'état du serveur.", reasonCode: "MCP_CONTROL_FAILED" }, { status: 503 });
  }
}
