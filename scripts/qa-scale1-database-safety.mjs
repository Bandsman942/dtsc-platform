import fs from "node:fs";
import path from "node:path";

const files = {
  prisma: "lib/prisma.ts",
  policy: "lib/database-connection-policy.ts",
  prismaConfig: "prisma.config.ts",
  envExample: "env.example",
  observability: "lib/scalability/production-observability.ts",
  dashboard: "components/admin/cto-scalability-dashboard.tsx",
  i18n: "lib/scalability/console-i18n.ts",
  docs: "docs/SCALABILITY_DATABASE_SAFETY.md",
};

for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) {
    console.error(`FAIL: missing ${file}`);
    process.exit(1);
  }
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]),
);

function walkTypeScript(directory) {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkTypeScript(resolved);
    return /\.(ts|tsx)$/.test(entry.name) ? [resolved.replaceAll("\\", "/")] : [];
  });
}

const runtimeTypeScript = ["app", "components", "lib"].flatMap(walkTypeScript);
const prismaClientOffenders = runtimeTypeScript.filter((file) => {
  if (file === files.prisma) return false;
  const content = fs.readFileSync(file, "utf8");
  return /new\s+PrismaClient\s*\(/.test(content);
});

const checks = [
  [source.prisma.includes("buildPrismaRuntimeDatabaseUrl"), "Prisma runtime must use the canonical database URL policy"],
  [source.prisma.includes("transactionOptions"), "Prisma singleton must declare bounded interactive transaction defaults"],
  [source.prisma.includes("maxWait: 2_000") && source.prisma.includes("timeout: 5_000"), "Prisma transaction budget must remain explicit"],
  [source.policy.includes("connectionLimit: 1"), "Neon pooled runtime must default to one Prisma connection per serverless instance"],
  [source.policy.includes("poolTimeoutSeconds: 5"), "Neon pooled runtime must bound pool wait time"],
  [source.policy.includes("connectTimeoutSeconds: 10"), "Neon pooled runtime must tolerate bounded Neon cold-start connection time"],
  [source.policy.includes('includes("-pooler.")'), "Neon pooled endpoint detection must be explicit"],
  [!source.policy.includes("console.log") && !source.policy.includes("console.warn"), "Database policy helper must not log connection URLs"],
  [source.prismaConfig.includes("process.env.DIRECT_URL ?? process.env.DATABASE_URL"), "Prisma CLI must prefer DIRECT_URL while preserving DATABASE_URL fallback"],
  [source.envExample.includes("DIRECT_URL="), "Environment contract must document DIRECT_URL"],
  [source.envExample.includes("-pooler"), "Environment contract must document pooled Neon runtime endpoint"],
  [source.observability.includes("getDatabaseConnectionPolicy"), "Production observability must expose the secret-free connection policy"],
  [source.observability.includes("pg_stat_activity"), "Production observability must measure PostgreSQL connection pressure"],
  [source.observability.includes("idle in transaction"), "Production observability must detect idle-in-transaction sessions"],
  [source.observability.includes("interval '1 second'"), "Production observability must detect active queries over the SCALE-1 budget"],
  [source.dashboard.includes("connectionPolicy.mode"), "CTO dashboard must surface runtime pooling mode"],
  [source.dashboard.includes("idleInTransactionConnections"), "CTO dashboard must surface idle-in-transaction pressure"],
  [source.dashboard.includes("longRunningQueries"), "CTO dashboard must surface long-running active queries"],
  [source.i18n.includes("poolingMode") && source.i18n.includes("pooledHint"), "SCALE-1 database UI strings must stay in the canonical FR/EN dictionary"],
  [!source.dashboard.includes("DATABASE_URL") && !source.dashboard.includes("DIRECT_URL") && !source.dashboard.includes("hostname") && !source.dashboard.includes("password"), "Dashboard must never expose database credentials or connection identifiers"],
  [source.docs.includes("DATABASE_URL") && source.docs.includes("DIRECT_URL"), "Database safety runbook must document runtime and migration connection roles"],
  [prismaClientOffenders.length === 0, `Only lib/prisma.ts may instantiate PrismaClient in runtime code; offenders: ${prismaClientOffenders.join(", ") || "none"}`],
];

const failures = checks.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log("SCALE-1 database safety contract: OK");
