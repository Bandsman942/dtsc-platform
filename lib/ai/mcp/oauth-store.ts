import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptMcpOAuthSecret, encryptMcpOAuthSecret, mcpOAuthConnectionAad, mcpOAuthStateAad } from "@/lib/ai/mcp/oauth-crypto";

export type McpOAuthCredentials = {
  accessToken: string;
  refreshToken?: string | null;
  tokenType: string;
  scope: string[];
  expiresAt?: string | null;
};

type ConnectionRow = {
  id: string;
  userId: string;
  organizationId: string;
  serverCode: string;
  encryptedCredentials: string;
  grantedScopes: string[];
  expiresAt: Date | null;
  connectedAt: Date;
  refreshedAt: Date | null;
  revokedAt: Date | null;
};

type StateRow = {
  id: string;
  state: string;
  userId: string;
  organizationId: string;
  serverCode: string;
  encryptedVerifier: string;
  redirectPath: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

function connectionAad(row: Pick<ConnectionRow, "userId" | "organizationId" | "serverCode">) {
  return mcpOAuthConnectionAad(row);
}

export async function getMcpOAuthConnection(input: { userId: string; organizationId: string; serverCode: string }) {
  const rows = await prisma.$queryRaw<ConnectionRow[]>(Prisma.sql`
    SELECT "id", "userId", "organizationId", "serverCode", "encryptedCredentials", "grantedScopes", "expiresAt", "connectedAt", "refreshedAt", "revokedAt"
    FROM "McpUserOAuthConnection"
    WHERE "userId" = ${input.userId}
      AND "organizationId" = ${input.organizationId}
      AND "serverCode" = ${input.serverCode}
      AND "revokedAt" IS NULL
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return null;
  const credentials = JSON.parse(decryptMcpOAuthSecret(row.encryptedCredentials, connectionAad(row))) as McpOAuthCredentials;
  return { ...row, credentials };
}

export async function listMcpOAuthConnectionServerCodes(input: { userId: string; organizationId: string }) {
  const rows = await prisma.$queryRaw<Array<{ serverCode: string }>>(Prisma.sql`
    SELECT "serverCode"
    FROM "McpUserOAuthConnection"
    WHERE "userId" = ${input.userId}
      AND "organizationId" = ${input.organizationId}
      AND "revokedAt" IS NULL
  `);
  return new Set(rows.map((row) => row.serverCode));
}

export async function saveMcpOAuthConnection(input: {
  userId: string;
  organizationId: string;
  serverCode: string;
  credentials: McpOAuthCredentials;
  refreshed?: boolean;
}) {
  const aad = mcpOAuthConnectionAad(input);
  const encrypted = encryptMcpOAuthSecret(JSON.stringify(input.credentials), aad);
  const expiresAt = input.credentials.expiresAt ? new Date(input.credentials.expiresAt) : null;
  const id = randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "McpUserOAuthConnection" (
      "id", "userId", "organizationId", "serverCode", "encryptedCredentials", "grantedScopes", "expiresAt", "connectedAt", "refreshedAt", "revokedAt", "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${input.userId}, ${input.organizationId}, ${input.serverCode}, ${encrypted}, ${input.credentials.scope}, ${expiresAt}, CURRENT_TIMESTAMP,
      ${input.refreshed ? new Date() : null}, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("userId", "organizationId", "serverCode") DO UPDATE SET
      "encryptedCredentials" = EXCLUDED."encryptedCredentials",
      "grantedScopes" = EXCLUDED."grantedScopes",
      "expiresAt" = EXCLUDED."expiresAt",
      "refreshedAt" = ${input.refreshed ? new Date() : null},
      "revokedAt" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
  `);
}

export async function revokeMcpOAuthConnection(input: { userId: string; organizationId: string; serverCode: string }) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "McpUserOAuthConnection"
    SET "revokedAt" = CURRENT_TIMESTAMP, "encryptedCredentials" = '', "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = ${input.userId}
      AND "organizationId" = ${input.organizationId}
      AND "serverCode" = ${input.serverCode}
      AND "revokedAt" IS NULL
  `);
}

export async function createMcpOAuthState(input: {
  state: string;
  userId: string;
  organizationId: string;
  serverCode: string;
  verifier: string;
  redirectPath?: string;
  expiresAt: Date;
}) {
  const id = randomUUID();
  const encryptedVerifier = encryptMcpOAuthSecret(input.verifier, mcpOAuthStateAad(input));
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "McpUserOAuthState" (
      "id", "state", "userId", "organizationId", "serverCode", "encryptedVerifier", "redirectPath", "expiresAt", "createdAt"
    ) VALUES (
      ${id}, ${input.state}, ${input.userId}, ${input.organizationId}, ${input.serverCode}, ${encryptedVerifier}, ${input.redirectPath || "/ai/apps"}, ${input.expiresAt}, CURRENT_TIMESTAMP
    )
  `);
}

export async function consumeMcpOAuthState(state: string) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<StateRow[]>(Prisma.sql`
      SELECT "id", "state", "userId", "organizationId", "serverCode", "encryptedVerifier", "redirectPath", "expiresAt", "consumedAt"
      FROM "McpUserOAuthState"
      WHERE "state" = ${state}
      LIMIT 1
      FOR UPDATE
    `);
    const row = rows[0];
    if (!row || row.consumedAt || row.expiresAt.getTime() <= Date.now()) return null;
    await tx.$executeRaw(Prisma.sql`
      UPDATE "McpUserOAuthState" SET "consumedAt" = CURRENT_TIMESTAMP WHERE "id" = ${row.id} AND "consumedAt" IS NULL
    `);
    const verifier = decryptMcpOAuthSecret(row.encryptedVerifier, mcpOAuthStateAad(row));
    return { ...row, verifier };
  });
}

export async function deleteExpiredMcpOAuthStates() {
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "McpUserOAuthState"
    WHERE "expiresAt" < CURRENT_TIMESTAMP - INTERVAL '1 hour'
       OR "consumedAt" < CURRENT_TIMESTAMP - INTERVAL '1 hour'
  `);
}
