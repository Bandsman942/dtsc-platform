import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseAdminRoleAccess, type AdminBlockId } from "@/lib/admin-access";
import { canAccessAdminSection } from "@/lib/business-roles";
import { getAppSettings } from "@/lib/settings";

type AdminSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;
type AdminBlockAccessResult =
  | { session: AdminSession; response?: undefined }
  | { session?: undefined; response: NextResponse };

export async function requireAdminBlockAccess(blockId: AdminBlockId): Promise<AdminBlockAccessResult> {
  const session = await getSession();
  if (!session) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const settings = await getAppSettings();
  const access = parseAdminRoleAccess(settings.adminRoleAccess);
  const hasAccess = await canAccessAdminSection({ id: session.userId, role: session.role }, blockId, access);
  if (!hasAccess) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { session };
}
