import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${"qa:gaming:advisory-lock-runtime"})::bigint)`,
    );
    const rows = await tx.$queryRaw(Prisma.sql`SELECT 1::int AS "ok"`);
    if (!Array.isArray(rows) || Number(rows[0]?.ok) !== 1) {
      throw new Error("Gaming advisory-lock runtime QA could not verify the active Prisma transaction.");
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  console.log("Gaming advisory-lock Prisma/PostgreSQL runtime QA passed.");
} finally {
  await prisma.$disconnect();
}
