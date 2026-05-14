import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessAdminBlock, parseAdminRoleAccess, type AdminBlockId } from "@/lib/admin-access";
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
  if (!canAccessAdminBlock(session.role, blockId, access)) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { session };
}
