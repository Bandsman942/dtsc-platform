import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireConsoleCapability } from "@/lib/admin-api";
import { writeAuditLog } from "@/lib/audit";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";

const schema = z.object({
  descriptionFr: z.string().trim().min(3).max(500).optional(),
  descriptionEn: z.string().trim().min(3).max(500).optional(),
  status: z.enum(["ENABLED", "DISABLED", "SCHEDULED", "ARCHIVED"]).optional(),
  audience: z.enum(["INTERNAL", "ALL_USERS", "ORGANIZATIONS", "USERS"]).optional(),
  environment: z.enum(["DEVELOPMENT", "PREVIEW", "PRODUCTION"]).optional(),
  rolloutPercentage: z.coerce.number().int().min(0).max(100).optional(),
  organizationIds: z.array(z.string().min(1)).max(500).optional(),
  userIds: z.array(z.string().min(1)).max(500).optional(),
  startsAt: z.string().datetime().nullable().optional().or(z.literal("")),
  endsAt: z.string().datetime().nullable().optional().or(z.literal("")),
  reason: z.string().trim().min(3).max(500),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden", reasonCode: "ORIGIN_FORBIDDEN" }, { status: 403 });
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SETTINGS_MANAGE);
  if (access.response) return access.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid feature flag", reasonCode: "VALIDATION_ERROR" }, { status: 400 });
  const { id } = await params;
  const before = await prisma.featureFlag.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found", reasonCode: "NOT_FOUND" }, { status: 404 });

  const flag = await prisma.featureFlag.update({
    where: { id },
    data: {
      ...(parsed.data.descriptionFr !== undefined ? { descriptionFr: parsed.data.descriptionFr } : {}),
      ...(parsed.data.descriptionEn !== undefined ? { descriptionEn: parsed.data.descriptionEn } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.audience !== undefined ? { audience: parsed.data.audience } : {}),
      ...(parsed.data.environment !== undefined ? { environment: parsed.data.environment } : {}),
      ...(parsed.data.rolloutPercentage !== undefined ? { rolloutPercentage: parsed.data.rolloutPercentage } : {}),
      ...(parsed.data.organizationIds !== undefined ? { organizationIds: parsed.data.organizationIds as Prisma.InputJsonValue } : {}),
      ...(parsed.data.userIds !== undefined ? { userIds: parsed.data.userIds as Prisma.InputJsonValue } : {}),
      ...(parsed.data.startsAt !== undefined ? { startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null } : {}),
      ...(parsed.data.endsAt !== undefined ? { endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null } : {}),
      ownerUserId: access.session.userId,
      metadata: { reason: parsed.data.reason },
    },
  });
  await writeAuditLog({ userId: access.session.userId, action: "CONSOLE_FEATURE_FLAG_UPDATED", entity: "FeatureFlag", entityId: id, before: { status: before.status, audience: before.audience, environment: before.environment, rolloutPercentage: before.rolloutPercentage }, after: { status: flag.status, audience: flag.audience, environment: flag.environment, rolloutPercentage: flag.rolloutPercentage }, reasonCode: access.reasonCode, riskLevel: "HIGH", metadata: { reason: parsed.data.reason, code: flag.code }, request: req });
  return NextResponse.json({ ok: true, flag, reasonCode: access.reasonCode });
}
