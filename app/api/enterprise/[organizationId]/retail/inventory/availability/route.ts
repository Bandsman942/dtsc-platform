import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseInventoryAvailability } from "@/lib/enterprise/inventory/reservations";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { retailInventoryVisibleSites } from "@/lib/enterprise/retail/site-access";

type Params = { params: Promise<{ organizationId: string }> };

const querySchema = z.object({ catalogItemId: z.string().trim().min(1).max(240) });

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const parsed = querySchema.safeParse({ catalogItemId: new URL(req.url).searchParams.get("catalogItemId") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query", message: "Sélectionnez un article." }, { status: 400 });
  try {
    const scope = await retailInventoryVisibleSites(organizationId, auth.session.userId);
    const availability = await getEnterpriseInventoryAvailability(organizationId, parsed.data.catalogItemId);
    // A cross-site total is sensitive too: recalculate from visible stores.
    const stores = scope.isolationEnabled
      ? availability.stores.filter((store) => scope.siteIds.includes(store.siteId))
      : availability.stores;
    const totalAvailable = stores.reduce((sum, store) => sum.plus(store.quantityAvailable), new Prisma.Decimal(0)).toFixed();
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-multi-store", action: "availability", catalogItemId: parsed.data.catalogItemId, storeCount: stores.length } });
    return NextResponse.json({ ...availability, stores, totalAvailable });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_MULTI_STORE_AVAILABILITY_FAILED");
  }
}
