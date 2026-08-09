import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashAiToolArguments } from "@/lib/ai/tools/security";
import type { AiToolRuntimeContext } from "@/lib/ai/tools/types";

const DEFAULT_CONFIRMATION_TTL_MS = 10 * 60 * 1000;
const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

type ConfirmationRow = {
  id: string;
  userId: string;
  organizationId: string | null;
  conversationId: string | null;
  turnId: string | null;
  toolCode: string;
  argumentsHash: string;
  argumentsJson: unknown | null;
  status: string;
  expiresAt: Date;
  confirmedAt: Date | null;
  consumedAt: Date | null;
};

export async function createAiToolConfirmation(input: {
  toolCode: string;
  args: unknown;
  context: AiToolRuntimeContext;
  ttlMs?: number;
}) {
  const id = randomUUID();
  const argumentsHash = hashAiToolArguments(input.args);
  const expiresAt = new Date(Date.now() + Math.max(60_000, input.ttlMs || DEFAULT_CONFIRMATION_TTL_MS));
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "AiToolConfirmation" (
      "id", "userId", "organizationId", "conversationId", "turnId", "toolCode", "argumentsHash", "argumentsJson", "status", "expiresAt", "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${input.context.userId}, ${input.context.organizationId || null}, ${input.context.conversationId || null},
      ${input.context.turnId || null}, ${input.toolCode}, ${argumentsHash}, ${jsonValue(input.args)}, 'PENDING', ${expiresAt}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `);
  return { id, argumentsHash, expiresAt };
}

export async function getPendingAiToolConfirmation(input: { confirmationId: string; context: AiToolRuntimeContext }) {
  const rows = await prisma.$queryRaw<ConfirmationRow[]>(Prisma.sql`
    SELECT "id", "userId", "organizationId", "conversationId", "turnId", "toolCode", "argumentsHash", "argumentsJson", "status", "expiresAt", "confirmedAt", "consumedAt"
    FROM "AiToolConfirmation"
    WHERE "id" = ${input.confirmationId}
      AND "userId" = ${input.context.userId}
      AND ("organizationId" IS NOT DISTINCT FROM ${input.context.organizationId || null})
      AND "status" = 'PENDING'
      AND "expiresAt" > CURRENT_TIMESTAMP
    LIMIT 1
  `);
  return rows[0] || null;
}

export async function confirmAiToolConfirmation(input: {
  confirmationId: string;
  toolCode: string;
  args: unknown;
  context: AiToolRuntimeContext;
}) {
  const argumentsHash = hashAiToolArguments(input.args);
  const updated = await prisma.$queryRaw<ConfirmationRow[]>(Prisma.sql`
    UPDATE "AiToolConfirmation"
    SET "status" = 'CONFIRMED', "confirmedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${input.confirmationId}
      AND "userId" = ${input.context.userId}
      AND "toolCode" = ${input.toolCode}
      AND "argumentsHash" = ${argumentsHash}
      AND ("organizationId" IS NOT DISTINCT FROM ${input.context.organizationId || null})
      AND ("conversationId" IS NOT DISTINCT FROM ${input.context.conversationId || null})
      AND ("turnId" IS NOT DISTINCT FROM ${input.context.turnId || null})
      AND "status" = 'PENDING'
      AND "expiresAt" > CURRENT_TIMESTAMP
    RETURNING "id", "userId", "organizationId", "conversationId", "turnId", "toolCode", "argumentsHash", "argumentsJson", "status", "expiresAt", "confirmedAt", "consumedAt"
  `);
  return updated[0] || null;
}

export async function consumeAiToolConfirmation(input: {
  confirmationId: string;
  toolCode: string;
  args: unknown;
  context: AiToolRuntimeContext;
}) {
  const argumentsHash = hashAiToolArguments(input.args);
  const consumed = await prisma.$queryRaw<ConfirmationRow[]>(Prisma.sql`
    UPDATE "AiToolConfirmation"
    SET "status" = 'CONSUMED', "consumedAt" = CURRENT_TIMESTAMP, "argumentsJson" = NULL, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${input.confirmationId}
      AND "userId" = ${input.context.userId}
      AND "toolCode" = ${input.toolCode}
      AND "argumentsHash" = ${argumentsHash}
      AND ("organizationId" IS NOT DISTINCT FROM ${input.context.organizationId || null})
      AND ("conversationId" IS NOT DISTINCT FROM ${input.context.conversationId || null})
      AND ("turnId" IS NOT DISTINCT FROM ${input.context.turnId || null})
      AND "status" = 'CONFIRMED'
      AND "expiresAt" > CURRENT_TIMESTAMP
    RETURNING "id", "userId", "organizationId", "conversationId", "turnId", "toolCode", "argumentsHash", "argumentsJson", "status", "expiresAt", "confirmedAt", "consumedAt"
  `);
  return consumed[0] || null;
}
