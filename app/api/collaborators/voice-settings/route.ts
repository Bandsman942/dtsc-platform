import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getCollaborationVoiceSettings } from "@/lib/collaboration-voice-settings";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getCollaborationVoiceSettings();
  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { domain: "collaboration-voice-settings" },
  });
  return NextResponse.json({
    voice: {
      enabled: settings.enabled,
      maxDurationSeconds: settings.maxDurationSeconds,
      maxFileSizeBytes: settings.maxFileSizeBytes,
    },
  });
}
