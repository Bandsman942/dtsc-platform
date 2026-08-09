import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-capabilities";
import { getEnterpriseModuleDefinition, normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (session.activeContext !== "ORGANIZATION" || session.activeOrganizationId !== organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const moduleCode = normalizeEnterpriseModuleCode(new URL(req.url).searchParams.get("module") || "");
  if (!getEnterpriseModuleDefinition(moduleCode)) return NextResponse.json({ error: "Unknown module" }, { status: 404 });
  const capabilities = await resolveEnterpriseModuleCapabilities({ userId: session.userId, organizationId, moduleCode });
  if (!capabilities.canRead) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "module-capabilities", moduleCode } });
  return NextResponse.json({ moduleCode, capabilities });
}
