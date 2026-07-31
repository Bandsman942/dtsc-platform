import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import type { EnterpriseFinanceAction, EnterpriseFinanceModuleCode } from "@/lib/enterprise/accounting/constants";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

export async function authorizeFinanceRequest(
  req: Request,
  organizationId: string,
  moduleCode: EnterpriseFinanceModuleCode,
  action: EnterpriseFinanceAction,
  options?: { mutation?: boolean; limit?: number; windowMs?: number },
) {
  if (options?.mutation && !isSameOriginRequest(req)) return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const session = await getSession();
  if (!session) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-finance:${moduleCode}:${action}:${session.userId}`), options?.limit || 120, options?.windowMs || 3600000);
  if (!limited.ok) return { ok: false as const, response: NextResponse.json({ error: "Too many requests" }, { status: 429 }) };
  const access = await getEnterpriseAccountingAccess({ session, organizationId, moduleCode, action });
  if (!access) return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true as const, session, access };
}

export function financeErrorResponse(error: unknown, fallback = "FINANCE_OPERATION_FAILED") {
  if (error instanceof EnterpriseAccountingError) {
    return NextResponse.json({ error: error.code, details: error.details }, { status: error.status });
  }
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    return NextResponse.json({ error: "FINANCE_DUPLICATE" }, { status: 409 });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export function financeListParams(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || 25) || 25));
  return { page, pageSize, search: url.searchParams.get("search")?.trim() || undefined, status: url.searchParams.get("status")?.trim() || undefined };
}
