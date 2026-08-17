import { NextResponse } from "next/server";
import { z } from "zod";
import { requireConsoleCapability } from "@/lib/admin-api";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { getProductionObservabilitySnapshot } from "@/lib/scalability/production-observability";

const querySchema = z.object({
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
});

export async function GET(request: Request) {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SECURITY_READ);
  if (access.response) return access.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ windowHours: url.searchParams.get("windowHours") || undefined });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid observability window", reasonCode: "VALIDATION_ERROR" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const snapshot = await getProductionObservabilitySnapshot(parsed.data.windowHours);
  return NextResponse.json(
    { snapshot, reasonCode: access.reasonCode },
    { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } },
  );
}
