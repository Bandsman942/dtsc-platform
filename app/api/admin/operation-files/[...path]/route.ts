import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog } from "@/lib/audit";
import { downloadOperationFileFromSupabase } from "@/lib/supabase-storage";

type Params = { params: Promise<{ path: string[] }> };
const operationFileBlocks = ["coo", "hrCfo", "sco", "mpo", "cto", "la", "ceo"] as const;

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  let userId = "";
  let lastResponse: NextResponse | undefined;
  for (const blockId of operationFileBlocks) {
    const { session, response } = await requireAdminBlockAccess(blockId);
    if (session) {
      userId = session.userId;
      break;
    }
    lastResponse = response;
  }
  if (!userId) {
    await writeApiLog({ request: req, statusCode: 403, startedAt });
    return lastResponse || NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { path } = await params;
  const storagePath = path.join("/");
  try {
    const file = await downloadOperationFileFromSupabase(storagePath);
    await writeApiLog({ request: req, statusCode: 200, userId, startedAt, metadata: { path: storagePath } });
    return new Response(file, {
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    await writeApiLog({ request: req, statusCode: 404, userId, startedAt, metadata: { path: storagePath } });
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }
}
