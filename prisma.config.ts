import { defineConfig } from "prisma/config";

export default defineConfig({
  engine: "classic",
  // DTSC uses Prisma's multi-file schema layout. Keep the directory as the
  // canonical schema source instead of narrowing the CLI to schema.prisma.
  schema: "prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Runtime application traffic uses DATABASE_URL and should use the Neon
    // pooled endpoint. Prisma CLI/admin operations may use a direct endpoint
    // through DIRECT_URL when configured. Falling back preserves local/CI
    // environments that intentionally provide only DATABASE_URL.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});