import { printCommercialDocument } from "@/lib/enterprise/crm-sales/print-documents";

type Params = { params: Promise<{ organizationId: string; quoteId: string }> };

/** Read-only authenticated print preview, available for every persisted status. */
export async function GET(req: Request, { params }: Params) {
  const { organizationId, quoteId } = await params;
  return printCommercialDocument(req, organizationId, quoteId, "quote");
}
