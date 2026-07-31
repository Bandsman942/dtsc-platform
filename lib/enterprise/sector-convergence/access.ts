import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

export async function authorizeSectorConvergenceRequest(
  req: Request,
  organizationId: string,
  options: { mutation?: boolean; limit?: number } = {},
) {
  if (options.mutation && !isSameOriginRequest(req)) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const session = await getSession();
  if (!session) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const [admin, finance] = await Promise.all([
    resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "ADMIN_DASHBOARD", action: "manage" }),
    resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "FINANCE_OVERVIEW", action: "manage" }),
  ]);
  if (!admin.allowed && !finance.allowed) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (options.mutation) {
    const limited = await rateLimit(
      getRateLimitKey(req, `sector-convergence:${organizationId}:${session.userId}`),
      options.limit || 30,
      60 * 60 * 1000,
    );
    if (!limited.ok) return { ok: false as const, response: NextResponse.json({ error: "Too many requests" }, { status: 429 }) };
  }
  return { ok: true as const, session };
}
