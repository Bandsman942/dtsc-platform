import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { finalizeRetailSaleReversalAccounting } from "@/lib/enterprise/retail/accounting";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { retailSaleReverseSchema } from "@/lib/enterprise/retail/schemas";
import { reverseRetailSale } from "@/lib/enterprise/retail/service";

type Params = { params: Promise<{ organizationId: string; saleId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, saleId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "manage", { mutation: true, limit: 40 });
  if (!auth.ok) return auth.response;
  const parsed = retailSaleReverseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Annulation invalide." }, { status: 400 });
  try {
    const sale = await reverseRetailSale(organizationId, saleId, auth.session.userId, parsed.data);
    const accounting = await finalizeRetailSaleReversalAccounting(organizationId, auth.session.userId, sale.id);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_RETAIL_SALE_REVERSED",
      entity: "EnterpriseRetailSale",
      entityId: sale.id,
      request: req,
      metadata: {
        organizationId,
        number: sale.number,
        reason: parsed.data.reason.slice(0, 500),
        reversalJournalEntryId: accounting.reversalJournalEntryId,
        inventoryReturnCount: accounting.inventoryReturnPostings.length,
        inventoryReturnJournalEntryIds: accounting.inventoryReturnPostings.map((item) => item.journalEntryId),
      },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-sales", action: "reverse", accountingPosted: true } });
    return NextResponse.json({ ok: true, sale, accounting });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_SALE_REVERSE_FAILED");
  }
}