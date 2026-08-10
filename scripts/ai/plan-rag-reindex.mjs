import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  })
);
const domain = args.get("domain") || "enterprise";
const sourceId = args.get("source-id") || null;
const fromIndex = args.get("from-index") || "legacy-openai-1536-v1";
const limit = Math.min(Math.max(Number(args.get("limit") || 25), 1), 100);

if (!new Set(["enterprise", "personal"]).has(domain)) {
  console.error("--domain must be enterprise or personal");
  process.exit(1);
}

try {
  if (domain === "enterprise") {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "id","organizationId","title","status","indexVersion","sourceVersion","indexedAt"
       FROM "EnterpriseAiKnowledgeSource"
       WHERE "archivedAt" IS NULL
         AND "extractedText" IS NOT NULL
         AND ($1::text IS NULL OR "id"=$1)
         AND ($2::text IS NULL OR "indexVersion"=$2)
       ORDER BY "updatedAt" ASC
       LIMIT $3`,
      sourceId,
      fromIndex || null,
      limit
    );
    console.log(
      JSON.stringify(
        { dryRun: true, domain, sourceId, fromIndex, limit, count: rows.length, candidates: rows },
        null,
        2
      )
    );
  } else {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "id","userId","organizationId","title","status","indexVersion","versionNumber","indexedAt"
       FROM "KnowledgeDocument"
       WHERE "extractedText" IS NOT NULL
         AND ($1::text IS NULL OR "id"=$1)
         AND ($2::text IS NULL OR "indexVersion"=$2)
       ORDER BY "updatedAt" ASC
       LIMIT $3`,
      sourceId,
      fromIndex || null,
      limit
    );
    console.log(
      JSON.stringify(
        { dryRun: true, domain, sourceId, fromIndex, limit, count: rows.length, candidates: rows },
        null,
        2
      )
    );
  }
} finally {
  await prisma.$disconnect();
}
