import { printCommercialDocument } from "@/lib/enterprise/crm-sales/print-documents";

type Params = { params: Promise<{ organizationId: string; salesOrderId: string }> };

/** Commercial order copy, not a Finance invoice or an accounting document. */
export async function GET(req: Request, { params }: Params) {
  const { organizationId, salesOrderId } = await params;
  return printCommercialDocument(req, organizationId, salesOrderId, "order");
}
