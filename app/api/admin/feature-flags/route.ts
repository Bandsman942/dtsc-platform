import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireConsoleCapability } from "@/lib/admin-api";
import { writeAuditLog } from "@/lib/audit";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";

const schema = z.object({
  code: z.string().trim().min(3).max(100).regex(/^[A-Z0-9_]+$/),
  descriptionFr: z.string().trim().min(3).max(500),
  descriptionEn: z.string().trim().min(3).max(500),
  status: z.enum(["ENABLED", "DISABLED", "SCHEDULED", "ARCHIVED"]).default("DISABLED"),
  audience: z.enum(["INTERNAL", "ALL_USERS", "ORGANIZATIONS", "USERS"]).default("INTERNAL"),
  environment: z.enum(["DEVELOPMENT", "PREVIEW", "PRODUCTION"]).default("PRODUCTION"),
  rolloutPercentage: z.coerce.number().int().min(0).max(100).default(0),
  organizationIds: z.array(z.string().min(1)).max(500).default([]),
  userIds: z.array(z.string().min(1)).max(500).default([]),
  startsAt: z.string().datetime().optional().or(z.literal("")),
  endsAt: z.string().datetime().optional().or(z.literal("")),
  reason: z.string().trim().min(3).max(500),
});

export async function GET() {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SETTINGS_READ);
  if (access.response) return access.response;
  const flags = await prisma.featureFlag.findMany({ orderBy: [{ environment: "asc" }, { code: "asc" }], take: 500 });
  return NextResponse.json({ flags, reasonCode: access.reasonCode });
}

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden", reasonCode: "ORIGIN_FORBIDDEN" }, { status: 403 });
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SETTINGS_MANAGE);
  if (access.response) return access.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid feature flag", reasonCode: "VALIDATION_ERROR" }, { status: 400 });

  const existing = await prisma.featureFlag.findUnique({ where: { code: parsed.data.code } });
  if (existing) return NextResponse.json({ error: "Feature flag already exists", reasonCode: "DUPLICATE_CODE" }, { status: 409 });
  const flag = await prisma.featureFlag.create({
    data: {
      code: parsed.data.code,
      descriptionFr: parsed.data.descriptionFr,
      descriptionEn: parsed.data.descriptionEn,
      status: parsed.data.status,
      audience: parsed.data.audience,
      environment: parsed.data.environment,
      rolloutPercentage: parsed.data.rolloutPercentage,
      organizationIds: parsed.data.organizationIds as Prisma.InputJsonValue,
      userIds: parsed.data.userIds as Prisma.InputJsonValue,
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
      ownerUserId: access.session.userId,
      metadata: { reason: parsed.data.reason },
    },
  });
  await writeAuditLog({ userId: access.session.userId, action: "CONSOLE_FEATURE_FLAG_CREATED", entity: "FeatureFlag", entityId: flag.id, after: { code: flag.code, status: flag.status, audience: flag.audience, environment: flag.environment, rolloutPercentage: flag.rolloutPercentage }, reasonCode: access.reasonCode, riskLevel: "HIGH", metadata: { reason: parsed.data.reason }, request: req });
  return NextResponse.json({ ok: true, flag, reasonCode: access.reasonCode }, { status: 201 });
}
