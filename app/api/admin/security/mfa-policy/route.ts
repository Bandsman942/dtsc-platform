import { NextResponse } from "next/server";
import { z } from "zod";
import { requireConsoleCapability } from "@/lib/admin-api";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { getGlobalMfaPolicy } from "@/lib/auth/mfa-policy";
import { isSameOriginRequest } from "@/lib/request-security";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/security";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";

const policySchema = z.object({
  requireMfaForAllUsers: z.boolean(),
  requireMfaForDtscInternal: z.boolean(),
  password: z.string().min(1).max(256),
  reason: z.string().trim().min(10).max(500),
}).strict();

export async function GET() {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SECURITY_READ);
  if (access.response) return access.response;
  const policy = await getGlobalMfaPolicy();
  return NextResponse.json({ policy }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SECURITY_MANAGE);
  if (access.response) return access.response;
  const limited = await rateLimit(getRateLimitKey(req, "admin:auth:mfa-policy:" + access.session.userId),
    4, 15 * 60 * 1000, { failureMode: "closed" });
  if (!limited.ok) return NextResponse.json({ error: "Trop de modifications. Réessayez plus tard." }, { status: 429 });
  const parsed = policySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Politique, motif et mot de passe requis." }, { status: 400 });
  const actor = await prisma.user.findUnique({ where: { id: access.session.userId }, select: { passwordHash: true, status: true } });
  if (!actor || actor.status !== "ACTIVE" || !verifyPassword(parsed.data.password, actor.passwordHash)) {
    await writeAuditLog({
      userId: access.session.userId, action: "AUTH_MFA_POLICY_CHANGE_DENIED",
      entity: "AppSetting", entityId: "global", request: req, reasonCode: "PASSWORD_INVALID", riskLevel: "HIGH",
    });
    return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 403 });
  }
  const before = await getGlobalMfaPolicy();
  const after = {
    requireMfaForAllUsers: parsed.data.requireMfaForAllUsers,
    requireMfaForDtscInternal: parsed.data.requireMfaForDtscInternal,
  };
  const policy = await prisma.appSetting.upsert({
    where: { id: "global" }, create: { id: "global", ...after }, update: after,
    select: { requireMfaForAllUsers: true, requireMfaForDtscInternal: true },
  });
  await writeAuditLog({
    userId: access.session.userId, action: "AUTH_GLOBAL_MFA_POLICY_UPDATED",
    entity: "AppSetting", entityId: "global", request: req, riskLevel: "CRITICAL",
    metadata: { before, after: policy, reason: parsed.data.reason },
  });
  return NextResponse.json({ ok: true, policy }, { headers: { "Cache-Control": "no-store" } });
}
