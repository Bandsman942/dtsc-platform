import { PrismaClient } from "@prisma/client";
import {
  buildPrismaRuntimeDatabaseUrl,
  getDatabaseConnectionPolicy,
} from "@/lib/database-connection-policy";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const runtimeDatabaseUrl = buildPrismaRuntimeDatabaseUrl();
const databaseConnectionPolicy = getDatabaseConnectionPolicy();

if (
  process.env.NODE_ENV === "production" &&
  databaseConnectionPolicy.status === "ACTION_REQUIRED"
) {
  console.warn(
    "[database] Production Neon runtime is using a direct endpoint. Configure DATABASE_URL with the Neon pooled (-pooler) endpoint before capacity certification.",
  );
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(runtimeDatabaseUrl ? { datasourceUrl: runtimeDatabaseUrl } : {}),
    // Keep Prisma's v6 transaction defaults explicit as a capacity contract.
    // Domain-specific transactions may override these values only when justified.
    transactionOptions: {
      maxWait: 2_000,
      timeout: 5_000,
    },
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
