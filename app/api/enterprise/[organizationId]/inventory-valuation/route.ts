import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { inventoryValuationQuerySchema } from "@/lib/enterprise/accounting/finance-domain-schemas";
import { authorizeFinanceRequest } from "@/lib/enterprise/accounting/http";
import { getInventoryValuation } from "@/lib/enterprise/accounting/inventory-accounting-service";

type Params = { params: Promise<{ organizationId: string }> };
export async function GET(req: Request, { params }: Params) { const startedAt = Date.now(); const { organizationId } = await params; const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_INVENTORY", "view"); if (!auth.ok) return auth.response; const url = new URL(req.url); const parsed = inventoryValuationQuerySchema.safeParse({ warehouseId: url.searchParams.get("warehouseId") || undefined, inventoryItemId: url.searchParams.get("inventoryItemId") || undefined }); if (!parsed.success) return NextResponse.json({ error: "Invalid query", message: parsed.error.issues[0]?.message }, { status: 400 }); const items = await getInventoryValuation(organizationId, parsed.data); await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "inventory-valuation" } }); return NextResponse.json({ items, scope: "COMMON_INVENTORY_ONLY", valuationMethod: "WEIGHTED_AVERAGE" }); }
