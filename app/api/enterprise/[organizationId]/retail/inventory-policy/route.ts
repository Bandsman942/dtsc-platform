import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import {
  mergeRetailInventoryPolicy,
  readRetailInventoryPolicy,
  retailInventoryPolicySchema,
} from "@/lib/enterprise/retail/inventory-policy";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
const updateSchema = z.object({
  revision: z.number().int().positive(),
  policy: retailInventoryPolicySchema,
}).strict();
const ADMIN_ROLES = ["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"];

async function canManageRetailPolicy(organizationId: string, userId: string) {
  const membership = await prisma.organizationMember.findFirst({
    where: { organizationId, userId, status: "ACTIVE", removedAt: null, role: { in: ADMIN_ROLES } },
    select: { id: true },
  });
  return Boolean(membership);
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  try {
    const configuration = await prisma.enterpriseRetailConfiguration.findUnique({
      where: { organizationId }, select: { revision: true, settingsJson: true },
    });
    if (!configuration) throw new EnterpriseRetailError("RETAIL_CONFIGURATION_REQUIRED", 409);
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId, metadata: { organizationId, domain: "retail-inventory-policy" } });
    return NextResponse.json({
      revision: configuration.revision,
      policy: readRetailInventoryPolicy(configuration.settingsJson),
      canManage: auth.access.canManage && await canManageRetailPolicy(organizationId, auth.session.userId),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVENTORY_POLICY_READ_FAILED");
  }
}

export async function PUT(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "manage", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  if (!await canManageRetailPolicy(organizationId, auth.session.userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_INVENTORY_POLICY_INPUT_INVALID", req);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.enterpriseRetailConfiguration.findUnique({ where: { organizationId } });
      if (!existing) throw new EnterpriseRetailError("RETAIL_CONFIGURATION_REQUIRED", 409);
      if (existing.revision !== parsed.data.revision) throw new EnterpriseRetailError("RETAIL_INVENTORY_POLICY_CONFLICT", 409);
      const updated = await tx.enterpriseRetailConfiguration.updateMany({
        where: { organizationId, revision: parsed.data.revision },
        data: {
          settingsJson: mergeRetailInventoryPolicy(existing.settingsJson, parsed.data.policy),
          updatedByUserId: auth.session.userId,
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new EnterpriseRetailError("RETAIL_INVENTORY_POLICY_CONFLICT", 409);
      return { revision: existing.revision + 1, policy: parsed.data.policy };
    });
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_RETAIL_INVENTORY_POLICY_UPDATED",
      entity: "EnterpriseRetailConfiguration",
      entityId: organizationId,
      request: req,
      metadata: { organizationId, revision: result.revision, expiryMode: result.policy.expiryMode, enforceFefo: result.policy.enforceFefo, warningDays: result.policy.warningDays },
    });
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId, metadata: { organizationId, domain: "retail-inventory-policy", action: "update" } });
    return NextResponse.json({ ...result, canManage: true });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVENTORY_POLICY_SAVE_FAILED");
  }
}
