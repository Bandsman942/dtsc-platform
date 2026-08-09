import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAiToolDefinition } from "@/lib/ai/tool-registry";
import { authorizeAiTool } from "@/lib/ai/tools/authorize";
import { consumeAiToolConfirmation, createAiToolConfirmation } from "@/lib/ai/tools/confirmation";
import { getAiToolExecutor } from "@/lib/ai/tools/executors";
import { getAiToolInputSchema, getAiToolOutputSchema } from "@/lib/ai/tools/schemas";
import { buildAiToolIdempotencyScopeKey, hashAiToolArguments } from "@/lib/ai/tools/security";
import type { AiToolExecutionResult, AiToolRuntimeContext } from "@/lib/ai/tools/types";

const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

type ExecutionRow = { id: string; status: string; resultJson: unknown | null };

export async function executeAiTool(input: {
  toolCode: string;
  args: unknown;
  context: AiToolRuntimeContext;
  confirmationId?: string | null;
}): Promise<AiToolExecutionResult> {
  const definition = getAiToolDefinition(input.toolCode);
  const inputSchema = getAiToolInputSchema(input.toolCode);
  const outputSchema = getAiToolOutputSchema(input.toolCode);
  const executor = getAiToolExecutor(input.toolCode);
  if (!definition || !inputSchema || !outputSchema || !executor) {
    return { ok: false, toolCode: input.toolCode, status: "DENIED", reasonCode: "TOOL_NOT_REGISTERED" };
  }

  const parsedInput = inputSchema.safeParse(input.args);
  if (!parsedInput.success) {
    return { ok: false, toolCode: input.toolCode, status: "INVALID_INPUT", reasonCode: "INVALID_TOOL_ARGUMENTS" };
  }

  const authorization = await authorizeAiTool(input.toolCode, input.context);
  if (!authorization.allowed) {
    return { ok: false, toolCode: input.toolCode, status: "DENIED", reasonCode: authorization.reasonCode };
  }

  const argumentsHash = hashAiToolArguments(parsedInput.data);
  const idempotencyScopeKey = buildAiToolIdempotencyScopeKey({
    userId: input.context.userId,
    organizationId: input.context.organizationId,
    conversationId: input.context.conversationId,
    turnId: input.context.turnId,
    toolCode: input.toolCode,
    argumentsHash,
  });

  if (definition.requiresConfirmation && !input.confirmationId) {
    const confirmation = await createAiToolConfirmation({ toolCode: input.toolCode, args: parsedInput.data, context: input.context });
    return {
      ok: false,
      toolCode: input.toolCode,
      status: "CONFIRMATION_REQUIRED",
      reasonCode: "CONFIRMATION_REQUIRED",
      result: { confirmationId: confirmation.id, expiresAt: confirmation.expiresAt.toISOString() },
    };
  }

  if (definition.requiresConfirmation) {
    const confirmation = await consumeAiToolConfirmation({
      confirmationId: input.confirmationId as string,
      toolCode: input.toolCode,
      args: parsedInput.data,
      context: input.context,
    });
    if (!confirmation) {
      return { ok: false, toolCode: input.toolCode, status: "DENIED", reasonCode: "CONFIRMATION_INVALID_OR_EXPIRED" };
    }
  }

  if (definition.idempotent) {
    const existing = await prisma.$queryRaw<ExecutionRow[]>(Prisma.sql`
      SELECT "id", "status", "resultJson"
      FROM "AiToolExecution"
      WHERE "idempotencyScopeKey" = ${idempotencyScopeKey}
      LIMIT 1
    `);
    if (existing[0]?.status === "SUCCESS") {
      return { ok: true, toolCode: input.toolCode, status: "SUCCESS", result: existing[0].resultJson, auditId: existing[0].id };
    }
  }

  const executionId = randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "AiToolExecution" (
      "id", "userId", "organizationId", "conversationId", "turnId", "toolCode", "toolMode", "argumentsHash",
      "confirmationId", "idempotencyScopeKey", "status", "auditLevel", "startedAt", "createdAt", "updatedAt"
    ) VALUES (
      ${executionId}, ${input.context.userId}, ${input.context.organizationId || null}, ${input.context.conversationId || null},
      ${input.context.turnId || null}, ${input.toolCode}, ${definition.mode}, ${argumentsHash}, ${input.confirmationId || null},
      ${idempotencyScopeKey}, 'STARTED', ${definition.auditLevel}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) ON CONFLICT ("idempotencyScopeKey") DO NOTHING
  `);

  try {
    const rawOutput = await executor({ args: parsedInput.data, context: input.context });
    const parsedOutput = outputSchema.safeParse(rawOutput);
    if (!parsedOutput.success) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "AiToolExecution" SET "status" = 'FAILED', "reasonCode" = 'INVALID_TOOL_OUTPUT', "completedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${executionId}
      `);
      return { ok: false, toolCode: input.toolCode, status: "INVALID_OUTPUT", reasonCode: "INVALID_TOOL_OUTPUT", auditId: executionId };
    }

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "AiToolExecution" SET "status" = 'SUCCESS', "resultJson" = ${jsonValue(parsedOutput.data)}, "completedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${executionId}
    `);

    if (input.context.organizationId) {
      await prisma.enterpriseAiToolCall.create({
        data: {
          organizationId: input.context.organizationId,
          conversationId: input.context.conversationId || null,
          userId: input.context.userId,
          toolName: input.toolCode,
          toolType: definition.mode,
          status: "SUCCESS",
          inputJson: jsonValue({ argumentsHash, turnId: input.context.turnId || null }),
          outputJson: jsonValue(parsedOutput.data),
        },
      });
    }

    return { ok: true, toolCode: input.toolCode, status: "SUCCESS", result: parsedOutput.data, auditId: executionId };
  } catch (error) {
    const reasonCode = error instanceof Error ? error.message.slice(0, 160) : "TOOL_EXECUTION_FAILED";
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "AiToolExecution" SET "status" = 'FAILED', "reasonCode" = ${reasonCode}, "completedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${executionId}
    `);
    return { ok: false, toolCode: input.toolCode, status: "FAILED", reasonCode, auditId: executionId };
  }
}
