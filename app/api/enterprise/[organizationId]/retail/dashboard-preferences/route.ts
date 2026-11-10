import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { retailDashboardPreferencesSchema, readRetailDashboardPreferences, mergeRetailDashboardPreferences } from "@/lib/enterprise/retail/dashboard-preferences";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
const updateSchema = z.object({ revision: z.number().int().positive(), preferences: retailDashboardPreferencesSchema }).strict();
const ownerRoles = ["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"];

async function authorize(organizationId: string, session: NonNullable<Awaited<ReturnType<typeof getSession>>>, manage = false) {
  const [access, membership] = await Promise.all([
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "RETAIL_POS", action: manage ? "manage" : "read" }),
    prisma.organizationMember.findFirst({ where: { organizationId, userId: session.userId, status: "ACTIVE", removedAt: null, role: { in: ownerRoles } }, select: { id: true } }),
  ]);
  return Boolean(access && membership);
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (!await authorize(organizationId, session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const configuration = await prisma.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { revision: true, settingsJson: true } });
  if (!configuration) return NextResponse.json({ error: "RETAIL_CONFIGURATION_REQUIRED" }, { status: 409 });
  await writeApiLog({ request: req, startedAt, statusCode: 200, userId: session.userId, metadata: { organizationId, domain: "retail-dashboard-preferences" } });
  return NextResponse.json({ revision: configuration.revision, preferences: readRetailDashboardPreferences(configuration.settingsJson) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (!await authorize(organizationId, session, true)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_DASHBOARD_PREFERENCES_INVALID", req);
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { revision: true, settingsJson: true } });
    if (!existing) return "NOT_FOUND" as const;
    if (existing.revision !== parsed.data.revision) return "CONFLICT" as const;
    const updated = await tx.enterpriseRetailConfiguration.updateMany({ where: { organizationId, revision: parsed.data.revision }, data: { settingsJson: mergeRetailDashboardPreferences(existing.settingsJson, parsed.data.preferences), revision: { increment: 1 }, updatedByUserId: session.userId } });
    return updated.count === 1 ? "OK" as const : "CONFLICT" as const;
  });
  if (result !== "OK") return NextResponse.json({ error: "RETAIL_DASHBOARD_PREFERENCES_CONFLICT", message: "La configuration a changé. Actualisez les paramètres et réessayez." }, { status: 409 });
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_RETAIL_DASHBOARD_PREFERENCES_UPDATED", entity: "EnterpriseRetailConfiguration", entityId: organizationId, request: req, metadata: { revision: parsed.data.revision + 1, preferences: parsed.data.preferences } });
  await writeApiLog({ request: req, startedAt, statusCode: 200, userId: session.userId, metadata: { organizationId, domain: "retail-dashboard-preferences", action: "update" } });
  return NextResponse.json({ revision: parsed.data.revision + 1, preferences: parsed.data.preferences });
}
