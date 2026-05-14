import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog } from "@/lib/audit";
import { downloadOperationFileFromSupabase } from "@/lib/supabase-storage";

type Params = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("coo");
  if (!session) {
    const fallback = await requireAdminBlockAccess("hrCfo");
    if (!fallback.session) {
      const secondFallback = await requireAdminBlockAccess("sco");
      if (!secondFallback.session) {
        await writeApiLog({ request: req, statusCode: 403, startedAt });
        return response || fallback.response || secondFallback.response || NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  const { path } = await params;
  const storagePath = path.join("/");
  try {
    const file = await downloadOperationFileFromSupabase(storagePath);
    await writeApiLog({ request: req, statusCode: 200, startedAt, metadata: { path: storagePath } });
    return new Response(file, {
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    await writeApiLog({ request: req, statusCode: 404, startedAt, metadata: { path: storagePath } });
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }
}
