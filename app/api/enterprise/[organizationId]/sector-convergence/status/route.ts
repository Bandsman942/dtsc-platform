import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeSectorConvergenceRequest } from "@/lib/enterprise/sector-convergence/access";
import { convergenceListSchema } from "@/lib/enterprise/sector-convergence/schemas";
import { listSectorConvergenceStatus } from "@/lib/enterprise/sector-convergence/sync-service";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeSectorConvergenceRequest(req, organizationId);
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const parsed = convergenceListSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query", message: parsed.error.issues[0]?.message }, { status: 400 });
  const result = await listSectorConvergenceStatus({ organizationId, ...parsed.data });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "sector-convergence-status", page: parsed.data.page } });
  return NextResponse.json(result);
}
