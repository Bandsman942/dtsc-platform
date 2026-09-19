import { NextResponse } from "next/server";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { releaseEnterpriseInventoryReservation } from "@/lib/enterprise/inventory/reservations";
import { inventoryReservationReleaseSchema } from "@/lib/enterprise/inventory/reservation-schemas";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";

type Params = { params: Promise<{ organizationId: string; reservationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, reservationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 240 });
  if (!auth.ok) return auth.response;
  const parsed = inventoryReservationReleaseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_INVENTORY_RESERVATIONS_RELEASE_INPUT_INVALID", req);
  try {
    const reservation = await releaseEnterpriseInventoryReservation(organizationId, reservationId, auth.session.userId, parsed.data.reason);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_INVENTORY_RESERVATION_RELEASED", entity: "EnterpriseInventoryReservation", entityId: reservation.id, request: req, metadata: { organizationId, salesOrderId: reservation.salesOrderId, warehouseId: reservation.warehouseId, reason: parsed.data.reason } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-inventory-reservations", action: "release", reservationId } });
    return NextResponse.json({ ok: true, reservation });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVENTORY_RESERVATION_RELEASE_FAILED");
  }
}
