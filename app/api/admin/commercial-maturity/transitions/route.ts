import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { canAccessAdministration } from "@/lib/admin-access";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { DTSC_SPECIAL_PERMISSIONS, hasDtscIndividualPermission } from "@/lib/dtsc-individual-permissions";
import { COMMERCIAL_MATURITY_LEVELS, canTransitionCommercialMaturity, getCommercialMaturityCard } from "@/lib/commercial-maturity-governance";
import { isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const transitionSchema = z.object({
  moduleType: z.enum(["STANDARD", "ERP"]),
  moduleCode: z.string().trim().min(2).max(160),
  toMaturity: z.enum(COMMERCIAL_MATURITY_LEVELS),
  reason: z.string().trim().min(10).max(1600),
  evidence: z.object({
    evidenceType: z.enum(["QA_PASSED", "PRODUCTION_VERIFIED", "USER_GUIDE", "OWNER_E2E", "INCIDENT", "DOCUMENTATION", "OTHER"]),
    title: z.string().trim().min(3).max(220),
    description: z.string().trim().max(1600).optional().or(z.literal("")),
    url: z.string().url().max(1000).optional().or(z.literal("")),
    ownerValidated: z.boolean().default(false),
  }),
  iterationCode: z.string().trim().max(80).optional().or(z.literal("")),
  pullRequestNumber: z.coerce.number().int().positive().optional(),
  commitSha: z.string().trim().regex(/^[a-f0-9]{7,40}$/i).optional().or(z.literal("")),
  productionDeploymentId: z.string().trim().max(240).optional().or(z.literal("")),
  e2eStatus: z.enum(["NON_EXECUTED", "PASSED", "FAILED"]).default("NON_EXECUTED"),
  ownerValidatedAt: z.string().datetime().optional().or(z.literal("")),
  idempotencyKey: z.string().trim().min(12).max(240),
}).strict();

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN", reasonCode: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED", reasonCode: "UNAUTHORIZED" }, { status: 401 });
  if (!isDtscInternalSession(session)) return NextResponse.json({ error: "FORBIDDEN", reasonCode: "FORBIDDEN" }, { status: 403 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } });
  if (!user || !canAccessAdministration(user.role)) return NextResponse.json({ error: "FORBIDDEN", reasonCode: "FORBIDDEN" }, { status: 403 });
  const isAdmin = user.role === "ADMIN";
  const canManage = isAdmin || await hasDtscIndividualPermission(session.userId, DTSC_SPECIAL_PERMISSIONS.MANAGE_COMMERCIAL_MATURITY);
  if (!canManage) return NextResponse.json({ error: "MATURITY_PERMISSION_REQUIRED", reasonCode: "MATURITY_PERMISSION_REQUIRED" }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `commercial-maturity-transition:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED", reasonCode: "RATE_LIMITED" }, { status: 429 });
  const parsed = transitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", reasonCode: "INVALID_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  const card = await getCommercialMaturityCard(data.moduleType, data.moduleCode);
  if (!card) return NextResponse.json({ error: "MODULE_NOT_FOUND", reasonCode: "MODULE_NOT_FOUND" }, { status: 404 });
  if (!canTransitionCommercialMaturity(card.maturity, data.toMaturity)) {
    return NextResponse.json({ error: "TRANSITION_NOT_ALLOWED", reasonCode: "TRANSITION_NOT_ALLOWED", currentMaturity: card.maturity }, { status: 409 });
  }

  const existingEvidence = await prisma.commercialMaturityEvidence.findMany({
    where: { moduleType: data.moduleType, moduleCode: data.moduleCode },
    select: { evidenceType: true, ownerValidated: true, productionId: true, commitSha: true },
  });
  const evidenceTypes = new Set([...existingEvidence.map((item) => item.evidenceType), data.evidence.evidenceType]);
  const promoting = COMMERCIAL_MATURITY_LEVELS.indexOf(data.toMaturity) > COMMERCIAL_MATURITY_LEVELS.indexOf(card.maturity);
  if (data.toMaturity === "COMMERCIAL_READY" && !isAdmin && !await hasDtscIndividualPermission(session.userId, DTSC_SPECIAL_PERMISSIONS.PROMOTE_COMMERCIAL_READY)) {
    return NextResponse.json({ error: "COMMERCIAL_PROMOTION_PERMISSION_REQUIRED", reasonCode: "COMMERCIAL_PROMOTION_PERMISSION_REQUIRED" }, { status: 403 });
  }
  if (!promoting && !isAdmin && !await hasDtscIndividualPermission(session.userId, DTSC_SPECIAL_PERMISSIONS.DEGRADE_COMMERCIAL_MATURITY)) {
    return NextResponse.json({ error: "MATURITY_DEGRADATION_PERMISSION_REQUIRED", reasonCode: "MATURITY_DEGRADATION_PERMISSION_REQUIRED" }, { status: 403 });
  }

  if (promoting && data.toMaturity === "PROFESSIONAL_READY") {
    const missing: string[] = [];
    const hasGuideEvidence = card.guidePresent || evidenceTypes.has("USER_GUIDE");
    const hasQaEvidence = Boolean(card.qaContract) && (card.qaGreen || evidenceTypes.has("QA_PASSED"));
    const hasProductionEvidence = Boolean(data.productionDeploymentId) || evidenceTypes.has("PRODUCTION_VERIFIED") || existingEvidence.some((item) => Boolean(item.productionId));
    if (!hasGuideEvidence) missing.push("USER_GUIDE");
    if (!hasQaEvidence) missing.push("QA_PASSED");
    if (!hasProductionEvidence) missing.push("PRODUCTION_VERIFIED");
    if (missing.length) return NextResponse.json({ error: "PROFESSIONAL_EVIDENCE_REQUIRED", reasonCode: "PROFESSIONAL_EVIDENCE_REQUIRED", missing }, { status: 409 });
  }

  if (data.toMaturity === "COMMERCIAL_READY") {
    const hasOwnerEvidence = data.evidence.ownerValidated || existingEvidence.some((item) => item.ownerValidated);
    if (data.e2eStatus !== "PASSED" || !data.ownerValidatedAt || !data.productionDeploymentId || !data.commitSha || !hasOwnerEvidence || !evidenceTypes.has("OWNER_E2E")) {
      return NextResponse.json({
        error: "OWNER_VALIDATION_REQUIRED",
        reasonCode: "OWNER_VALIDATION_REQUIRED",
        missing: [
          ...(data.e2eStatus !== "PASSED" ? ["E2E_PASSED"] : []),
          ...(!data.ownerValidatedAt ? ["OWNER_VALIDATED_AT"] : []),
          ...(!data.productionDeploymentId ? ["PRODUCTION_DEPLOYMENT"] : []),
          ...(!data.commitSha ? ["MERGED_SHA"] : []),
          ...(!hasOwnerEvidence || !evidenceTypes.has("OWNER_E2E") ? ["OWNER_E2E_EVIDENCE"] : []),
        ],
      }, { status: 409 });
    }
  }

  if (!promoting && data.evidence.evidenceType !== "INCIDENT") {
    return NextResponse.json({ error: "INCIDENT_EVIDENCE_REQUIRED", reasonCode: "INCIDENT_EVIDENCE_REQUIRED" }, { status: 409 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const latestTransition = await tx.commercialMaturityTransition.findFirst({
        where: { moduleType: data.moduleType, moduleCode: data.moduleCode, status: "APPLIED" },
        orderBy: { createdAt: "desc" },
        select: { toMaturity: true },
      });
      const currentMaturity = latestTransition && (COMMERCIAL_MATURITY_LEVELS as readonly string[]).includes(latestTransition.toMaturity)
        ? latestTransition.toMaturity
        : card.baseMaturity;
      if (currentMaturity !== card.maturity) throw new Error("MATURITY_CONFLICT");

      const evidence = await tx.commercialMaturityEvidence.create({
        data: {
          moduleType: data.moduleType,
          moduleCode: data.moduleCode,
          evidenceType: data.evidence.evidenceType,
          title: data.evidence.title,
          description: data.evidence.description || null,
          url: data.evidence.url || null,
          prNumber: data.pullRequestNumber || null,
          commitSha: data.commitSha || null,
          productionId: data.productionDeploymentId || null,
          ownerValidated: data.toMaturity === "COMMERCIAL_READY" && data.evidence.ownerValidated,
          createdById: session.userId,
        },
      });
      const transition = await tx.commercialMaturityTransition.create({
        data: {
          moduleType: data.moduleType,
          moduleCode: data.moduleCode,
          fromMaturity: card.maturity,
          toMaturity: data.toMaturity,
          status: "APPLIED",
          reason: data.reason,
          evidenceIdsJson: [evidence.id] as Prisma.InputJsonValue,
          criteriaSnapshotJson: { satisfied: card.criteriaSatisfied, missing: card.criteriaMissing } as Prisma.InputJsonValue,
          iterationCode: data.iterationCode || null,
          pullRequestNumber: data.pullRequestNumber || null,
          commitSha: data.commitSha || null,
          productionDeploymentId: data.productionDeploymentId || null,
          e2eStatus: data.e2eStatus,
          ownerValidatedAt: data.ownerValidatedAt ? new Date(data.ownerValidatedAt) : null,
          createdById: session.userId,
          idempotencyKey: data.idempotencyKey,
        },
      });
      return { evidence, transition };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await writeAuditLog({ userId: session.userId, action: "COMMERCIAL_MATURITY_TRANSITION_APPLIED", entity: "CommercialMaturityTransition", entityId: result.transition.id, request: req, metadata: { moduleType: data.moduleType, moduleCode: data.moduleCode, fromMaturity: card.maturity, toMaturity: data.toMaturity, evidenceId: result.evidence.id } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { transitionId: result.transition.id, moduleType: data.moduleType, moduleCode: data.moduleCode } });
    return NextResponse.json({ ok: true, transition: result.transition, evidence: result.evidence }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "MATURITY_CONFLICT") {
      return NextResponse.json({ error: "MATURITY_CONFLICT", reasonCode: "MATURITY_CONFLICT" }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "MATURITY_CONFLICT", reasonCode: "MATURITY_CONFLICT" }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.commercialMaturityTransition.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
      return NextResponse.json({ ok: true, transition: existing, idempotent: true }, { status: 200 });
    }
    await writeApiLog({ request: req, statusCode: 500, userId: session.userId, startedAt, metadata: { moduleType: data.moduleType, moduleCode: data.moduleCode } });
    return NextResponse.json({ error: "TRANSITION_FAILED", reasonCode: "TRANSITION_FAILED" }, { status: 500 });
  }
}
