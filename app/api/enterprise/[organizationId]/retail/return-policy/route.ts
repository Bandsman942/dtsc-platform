import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { hasRecentStepUp } from "@/lib/auth/step-up";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { RETAIL_OWNER_ROLES } from "@/lib/enterprise/retail/site-access";
import {
  mergeRetailInvoiceReturnPolicy,
  readRetailInvoiceReturnPolicy,
  retailInvoiceReturnPolicySchema,
} from "@/lib/enterprise/retail/invoice-return-policy";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
const updateSchema = z.object({
  revision: z.number().int().positive(),
  policy: retailInvoiceReturnPolicySchema,
}).strict();

async function canManage(organizationId: string, userId: string) {
  const member = await prisma.organizationMember.findFirst({
    where: { organizationId, userId, status: "ACTIVE", removedAt: null },
    select: { role: true },
  });
  return Boolean(member && RETAIL_OWNER_ROLES.has(member.role));
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  try {
    const config = await prisma.enterpriseRetailConfiguration.findUnique({
      where: { organizationId }, select: { revision: true, settingsJson: true },
    });
    if (!config) throw new EnterpriseRetailError("RETAIL_CONFIGURATION_REQUIRED", 409);
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId,
      metadata: { organizationId, domain: "retail-invoice-return-policy", action: "read" } });
    return NextResponse.json({
      revision: config.revision,
      policy: readRetailInvoiceReturnPolicy(config.settingsJson),
      canManage: auth.access.canManage && await canManage(organizationId, auth.session.userId),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return retailErrorResponse(error, "RETAIL_RETURN_POLICY_READ_FAILED"); }
}

export async function PUT(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "manage", { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;
  if (!await canManage(organizationId, auth.session.userId)) {
    return NextResponse.json({ error: "RETAIL_SITE_ACCESS_DENIED" }, { status: 403 });
  }
  if (!await hasRecentStepUp(auth.session)) {
    return NextResponse.json({ error: "STEP_UP_REQUIRED", message: "Confirmez votre identité pour modifier les autorisations de remboursement." },
      { status: 428, headers: { "Cache-Control": "private, no-store" } });
  }
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_RETURN_POLICY_INPUT_INVALID", req);
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailConfiguration" WHERE "organizationId" = ${organizationId} FOR UPDATE`);
      const config = await tx.enterpriseRetailConfiguration.findUnique({ where: { organizationId } });
      if (!config) throw new EnterpriseRetailError("RETAIL_CONFIGURATION_REQUIRED", 409);
      if (config.revision !== parsed.data.revision) throw new EnterpriseRetailError("RETAIL_RETURN_POLICY_CONFLICT", 409);
      const oldPolicy = readRetailInvoiceReturnPolicy(config.settingsJson);
      const changed = await tx.enterpriseRetailConfiguration.updateMany({
        where: { organizationId, revision: parsed.data.revision },
        data: {
          settingsJson: mergeRetailInvoiceReturnPolicy(config.settingsJson, parsed.data.policy),
          updatedByUserId: auth.session.userId,
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new EnterpriseRetailError("RETAIL_RETURN_POLICY_CONFLICT", 409);
      await tx.auditLog.create({ data: {
        organizationId, userId: auth.session.userId,
        action: "ENTERPRISE_RETAIL_RETURN_POLICY_UPDATED",
        entity: "EnterpriseRetailConfiguration", entityId: config.id, riskLevel: "HIGH",
        beforeJson: { policy: oldPolicy }, afterJson: { policy: parsed.data.policy },
        metadata: { organizationId, revision: config.revision + 1, scope: parsed.data.policy.scope },
      } });
      return { revision: config.revision + 1, policy: parsed.data.policy };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_RETURN_POLICY_UPDATED",
      entity: "EnterpriseRetailConfiguration", entityId: organizationId, request: req,
      metadata: { organizationId, version: result.policy.version, mode: result.policy.mode } });
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId,
      metadata: { organizationId, domain: "retail-invoice-return-policy", action: "update" } });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return retailErrorResponse(error, "RETAIL_RETURN_POLICY_SAVE_FAILED"); }
}
