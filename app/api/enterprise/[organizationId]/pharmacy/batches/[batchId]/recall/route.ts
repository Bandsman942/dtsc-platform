import { performPharmacyBatchAction } from "@/lib/pharmacy-batch-actions";
type Params = { params: Promise<{ organizationId: string; batchId: string }> };
export async function POST(req: Request, { params }: Params) { const { organizationId, batchId } = await params; return performPharmacyBatchAction(req, organizationId, batchId, "recall"); }
