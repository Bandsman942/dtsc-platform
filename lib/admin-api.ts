import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseAdminRoleAccess, type AdminBlockId } from "@/lib/admin-access";
import { canAccessAdminSection } from "@/lib/business-roles";
import { getConsoleAccessDecision, type ConsoleCapability } from "@/lib/console/console-capabilities";
import { isDtscInternalSession } from "@/lib/organizations";
import { getAppSettings } from "@/lib/settings";

export type AdminSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;
type AdminAccessResult =
  | { session: AdminSession; response?: undefined; reasonCode?: string }
  | { session?: undefined; response: NextResponse; reasonCode: string };

function errorResponse(error: string, status: number, reasonCode: string) {
  return NextResponse.json({ error, reasonCode }, { status });
}

export async function requireAdminBlockAccess(blockId: AdminBlockId): Promise<AdminAccessResult> {
  const session = await getSession();
  if (!session) {
    return { response: errorResponse("Unauthenticated", 401, "UNAUTHENTICATED"), reasonCode: "UNAUTHENTICATED" };
  }
  if (!isDtscInternalSession(session)) {
    return { response: errorResponse("DTSC internal context required", 403, "NOT_DTSC_INTERNAL"), reasonCode: "NOT_DTSC_INTERNAL" };
  }

  const settings = await getAppSettings();
  const access = parseAdminRoleAccess(settings.adminRoleAccess);
  const hasAccess = await canAccessAdminSection({ id: session.userId, role: session.role }, blockId, access);
  if (!hasAccess) {
    return { response: errorResponse("Forbidden", 403, "SECTION_FORBIDDEN"), reasonCode: "SECTION_FORBIDDEN" };
  }

  return { session, reasonCode: "ALLOWED_ROLE_BLOCK" };
}

export async function requireConsoleCapability(capability: ConsoleCapability): Promise<AdminAccessResult> {
  const session = await getSession();
  if (!session) {
    return { response: errorResponse("Unauthenticated", 401, "UNAUTHENTICATED"), reasonCode: "UNAUTHENTICATED" };
  }
  if (!isDtscInternalSession(session)) {
    return { response: errorResponse("DTSC internal context required", 403, "NOT_DTSC_INTERNAL"), reasonCode: "NOT_DTSC_INTERNAL" };
  }

  const settings = await getAppSettings();
  const adminRoleAccess = parseAdminRoleAccess(settings.adminRoleAccess);
  const decision = await getConsoleAccessDecision({
    user: { id: session.userId, role: session.role },
    capability,
    adminRoleAccess,
  });
  if (!decision.allowed) {
    return {
      response: errorResponse("Capability required", 403, decision.reasonCode),
      reasonCode: decision.reasonCode,
    };
  }

  return { session, reasonCode: decision.reasonCode };
}
