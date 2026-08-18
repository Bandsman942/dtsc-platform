export type DatabaseConnectionMode =
  | "NEON_POOLED"
  | "NEON_DIRECT"
  | "POSTGRESQL_OTHER"
  | "UNCONFIGURED"
  | "INVALID";

export type DatabaseConnectionPolicyStatus =
  | "OK"
  | "ACTION_REQUIRED"
  | "UNVERIFIED"
  | "UNCONFIGURED"
  | "INVALID";

export const NEON_RUNTIME_CONNECTION_DEFAULTS = {
  // SCALE-1B #416: once Neon PgBouncer is in front of the runtime, a single
  // Prisma connection per warm Fluid Compute instance serializes otherwise
  // parallel reads. Five is the first evidence-tuning candidate and matches
  // Prisma v6's common 2*CPU+1 starting point for a 2-CPU process. Explicit
  // operator URL parameters still win and can override this value.
  connectionLimit: 5,
  poolTimeoutSeconds: 5,
  connectTimeoutSeconds: 10,
} as const;

function parseIntegerParameter(url: URL, key: string) {
  const raw = url.searchParams.get(key);
  if (raw == null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function isNeonHostname(hostname: string) {
  return hostname.toLowerCase().endsWith(".neon.tech");
}

function isNeonPoolerHostname(hostname: string) {
  return isNeonHostname(hostname) && hostname.toLowerCase().includes("-pooler.");
}

function parseDatabaseUrl(raw: string | null | undefined) {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Builds the Prisma runtime URL without ever logging or returning credentials separately.
 *
 * For Neon pooled endpoints we apply conservative serverless defaults only when the
 * operator did not already provide an explicit value. Direct Neon endpoints are never
 * rewritten silently: switching endpoint type is an infrastructure decision that must
 * be made in the environment configuration.
 */
export function buildPrismaRuntimeDatabaseUrl(raw = process.env.DATABASE_URL) {
  if (!raw?.trim()) return undefined;
  const url = parseDatabaseUrl(raw);
  if (!url) return raw;

  if (isNeonPoolerHostname(url.hostname)) {
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", String(NEON_RUNTIME_CONNECTION_DEFAULTS.connectionLimit));
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", String(NEON_RUNTIME_CONNECTION_DEFAULTS.poolTimeoutSeconds));
    }
    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", String(NEON_RUNTIME_CONNECTION_DEFAULTS.connectTimeoutSeconds));
    }
  }

  return url.toString();
}

/**
 * Returns a secret-free operational snapshot of DATABASE_URL.
 * Username, password, hostname, database name and raw query string are intentionally
 * excluded so this object can be surfaced in protected observability safely.
 */
export function getDatabaseConnectionPolicy(raw = process.env.DATABASE_URL) {
  if (!raw?.trim()) {
    return {
      status: "UNCONFIGURED" as const,
      mode: "UNCONFIGURED" as const,
      isNeon: false,
      isPooled: false,
      parameters: {
        connectionLimit: null,
        poolTimeoutSeconds: null,
        connectTimeoutSeconds: null,
      },
    };
  }

  const parsed = parseDatabaseUrl(raw);
  if (!parsed) {
    return {
      status: "INVALID" as const,
      mode: "INVALID" as const,
      isNeon: false,
      isPooled: false,
      parameters: {
        connectionLimit: null,
        poolTimeoutSeconds: null,
        connectTimeoutSeconds: null,
      },
    };
  }

  const isNeon = isNeonHostname(parsed.hostname);
  const isPooled = isNeonPoolerHostname(parsed.hostname);
  const mode: DatabaseConnectionMode = isNeon
    ? isPooled
      ? "NEON_POOLED"
      : "NEON_DIRECT"
    : "POSTGRESQL_OTHER";
  const status: DatabaseConnectionPolicyStatus = isNeon
    ? isPooled
      ? "OK"
      : "ACTION_REQUIRED"
    : "UNVERIFIED";

  const effectiveUrl = parseDatabaseUrl(buildPrismaRuntimeDatabaseUrl(raw));

  return {
    status,
    mode,
    isNeon,
    isPooled,
    parameters: {
      connectionLimit: effectiveUrl ? parseIntegerParameter(effectiveUrl, "connection_limit") : null,
      poolTimeoutSeconds: effectiveUrl ? parseIntegerParameter(effectiveUrl, "pool_timeout") : null,
      connectTimeoutSeconds: effectiveUrl ? parseIntegerParameter(effectiveUrl, "connect_timeout") : null,
    },
  };
}
