import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
const inputSchema = z.object({
  inventoryItemId: z.string().min(1), revision: z.number().int().positive(),
  minimumQuantity: z.number().min(0).max(1_000_000_000).nullable(),
  reorderQuantity: z.number().min(0).max(1_000_000_000).nullable(),
  lotTracking: z.boolean(), expiryTracking: z.boolean(),
}).strict();

export async function PUT(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "manage" });
  if (!access?.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "INVENTORY_POLICY_INVALID", req);
  const input = parsed.data;
  if (input.expiryTracking && !input.lotTracking) return NextResponse.json({ error: "INVENTORY_POLICY_BATCH_REQUIRED", message: "Activez le suivi des lots avant les péremptions." }, { status: 400 });
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.enterpriseInventoryItem.findFirst({ where: { organizationId, id: input.inventoryItemId, archivedAt: null }, select: { id: true, revision: true, lotTracking: true, expiryTracking: true } });
    if (!item) return "NOT_FOUND" as const;
    if (item.revision !== input.revision) return "CONFLICT" as const;
    if ((item.lotTracking && !input.lotTracking) || (item.expiryTracking && !input.expiryTracking)) {
      const historicLots = await tx.enterpriseStockLot.count({ where: { organizationId, inventoryItemId: item.id, archivedAt: null } });
      if (historicLots) return "HAS_LOTS" as const;
    }
    const updated = await tx.enterpriseInventoryItem.updateMany({ where: { organizationId, id: item.id, revision: input.revision }, data: {
      minimumQuantity: input.minimumQuantity, reorderQuantity: input.reorderQuantity,
      lotTracking: input.lotTracking, expiryTracking: input.expiryTracking,
      updatedByUserId: session.userId, revision: { increment: 1 },
    } });
    return updated.count === 1 ? "OK" as const : "CONFLICT" as const;
  });
  if (result !== "OK") return NextResponse.json({ error: `INVENTORY_POLICY_${result}`, message: result === "HAS_LOTS" ? "Des lots existants empêchent de désactiver leur traçabilité." : result === "NOT_FOUND" ? "Article de stock introuvable." : "La politique a été modifiée entre-temps. Actualisez la fiche." }, { status: result === "NOT_FOUND" ? 404 : 409 });
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_INVENTORY_ITEM_POLICY_UPDATED", entity: "EnterpriseInventoryItem", entityId: input.inventoryItemId, request: req, metadata: { revision: input.revision + 1, lotTracking: input.lotTracking, expiryTracking: input.expiryTracking } });
  await writeApiLog({ request: req, startedAt, statusCode: 200, userId: session.userId, metadata: { organizationId, domain: "inventory-item-policy" } });
  return NextResponse.json({ ok: true, revision: input.revision + 1 });
}
