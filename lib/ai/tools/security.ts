import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function hashAiToolArguments(args: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(args))).digest("hex");
}

export function buildAiToolIdempotencyScopeKey(input: {
  userId: string;
  organizationId?: string | null;
  conversationId?: string | null;
  turnId?: string | null;
  toolCode: string;
  argumentsHash: string;
}) {
  const scope = [
    input.userId,
    input.organizationId || "GLOBAL",
    input.conversationId || "NO_CONVERSATION",
    input.turnId || "NO_TURN",
    input.toolCode,
    input.argumentsHash,
  ].join(":");
  return createHash("sha256").update(scope).digest("hex");
}
