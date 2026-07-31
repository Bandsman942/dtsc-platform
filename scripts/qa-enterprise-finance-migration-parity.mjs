import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;
if (!shadowDatabaseUrl) {
  throw new Error("SHADOW_DATABASE_URL is required for Finance migration parity checks");
}

const accountingSchema = readFileSync("prisma/enterprise-accounting.prisma", "utf8");
const financeModels = new Set(
  [...accountingSchema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]),
);
financeModels.add("EnterpriseFinancialStatementSnapshot");

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "prisma",
    "migrate",
    "diff",
    "--from-migrations",
    "prisma/migrations",
    "--to-schema-datamodel",
    "prisma",
    "--shadow-database-url",
    shadowDatabaseUrl,
    "--script",
  ],
  { encoding: "utf8", env: process.env, maxBuffer: 32 * 1024 * 1024 },
);

if (![0, 2].includes(result.status ?? 1)) {
  process.stderr.write(result.stderr || result.stdout || "Prisma migrate diff failed\n");
  process.exit(result.status ?? 1);
}

const diffSql = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const affectedModels = [...financeModels].filter((model) => diffSql.includes(`"${model}"`));

if (affectedModels.length > 0) {
  console.error("Finance migration/schema drift detected for:");
  for (const model of affectedModels.sort()) console.error(`- ${model}`);
  console.error("\nRelevant Prisma diff statements:");
  for (const line of diffSql.split("\n")) {
    if (affectedModels.some((model) => line.includes(`"${model}"`))) console.error(line);
  }
  process.exit(1);
}

console.log(
  `✓ Finance migration parity: ${financeModels.size} Finance models are unaffected by the remaining repository-wide historical drift.`,
);
