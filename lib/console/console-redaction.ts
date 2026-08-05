const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /(authorization|cookie|secret|token|password|passwd|otp|api[-_]?key|private[-_]?key|card|cvv|cvc|pin|access[-_]?key|refresh[-_]?token|diagnosis|symptom|prescription|medical[-_]?record|clinical[-_]?note)/i;

export function redactConsoleValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 2_000 ? `${value.slice(0, 2_000)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactConsoleValue(item, depth + 1));
  if (typeof value !== "object") return String(value);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).slice(0, 200).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redactConsoleValue(item, depth + 1),
    ])
  );
}

export function redactConsoleText(value: string | null | undefined) {
  if (!value) return value || null;
  return value
    .replace(/(bearer\s+)[a-z0-9._~+\/-]+/gi, "$1[REDACTED]")
    .replace(/((?:token|secret|password|otp|api[-_]?key)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 2_000);
}
