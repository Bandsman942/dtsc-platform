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
    // Commands such as `prisma generate` do not require a live database URL.
    // Migration/runtime commands still receive DATABASE_URL from their execution environment.
    url: process.env.DATABASE_URL ?? "",
  },
});