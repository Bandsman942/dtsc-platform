import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseInventoryAvailability } from "@/lib/enterprise/inventory/reservations";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";

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
    const availability = await getEnterpriseInventoryAvailability(organizationId, parsed.data.catalogItemId);
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-multi-store", action: "availability", catalogItemId: parsed.data.catalogItemId, storeCount: availability.stores.length } });
    return NextResponse.json(availability);
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_MULTI_STORE_AVAILABILITY_FAILED");
  }
}
