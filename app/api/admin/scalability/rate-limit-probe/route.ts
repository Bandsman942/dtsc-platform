import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireConsoleCapability } from "@/lib/admin-api";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import {
  __rateLimitWithUnavailableRedisForScalabilityProbe,
  rateLimit,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INSTANCE_ID = randomBytes(8).toString("hex");
const PROBE_WINDOW_MS = 120_000;

const querySchema = z.object({
  mode: z.enum(["healthy", "closed", "local", "open"]),
  runId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function probeKey(mode: z.infer<typeof querySchema>["mode"], runId: string) {
  if (mode === "closed") return `auth:sign-in:scale3-probe:${runId}`;
  if (mode === "open") return `scale3-probe:explicit-open:${runId}`;
  if (mode === "local") return `scale3-probe:availability:${runId}`;
  return `scale3-probe:healthy:${runId}`;
}

export async function GET(request: Request) {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SECURITY_READ);
  if (access.response) return access.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    mode: url.searchParams.get("mode"),
    runId: url.searchParams.get("runId"),
    limit: url.searchParams.get("limit") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid scalability probe parameters", reasonCode: "VALIDATION_ERROR" },
      { status: 400, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } },
    );
  }

  const { mode, runId, limit } = parsed.data;
  const key = probeKey(mode, runId);
  const startedAt = performance.now();

  const result = mode === "healthy"
    ? await rateLimit(key, limit, PROBE_WINDOW_MS)
    : await __rateLimitWithUnavailableRedisForScalabilityProbe(
        key,
        limit,
        PROBE_WINDOW_MS,
        "TIMEOUT",
        mode === "open" ? { failureMode: "open" } : {},
      );

  const elapsedMs = Math.max(0, performance.now() - startedAt);

  return NextResponse.json(
    {
      mode,
      instanceId: INSTANCE_ID,
      limit,
      windowMs: PROBE_WINDOW_MS,
      elapsedMs: Math.round(elapsedMs * 100) / 100,
      result: {
        ok: result.ok,
        remaining: result.remaining,
        source: result.source,
        degraded: result.degraded,
        reason: result.reason,
      },
      reasonCode: access.reasonCode,
    },
    { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } },
  );
}
