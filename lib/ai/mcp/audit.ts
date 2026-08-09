import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { McpDiscoverySnapshot } from "@/lib/ai/mcp/types";

const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

type StoredSnapshotRow = {
  version: string;
  toolsJson: unknown;
  resourcesJson: unknown;
  promptsJson: unknown;
  discoveredAt: Date;
};

export async function getLatestMcpDiscoverySnapshot(serverCode: string): Promise<McpDiscoverySnapshot | null> {
  const rows = await prisma.$queryRaw<StoredSnapshotRow[]>(Prisma.sql`
    SELECT "version", "toolsJson", "resourcesJson", "promptsJson", "discoveredAt"
    FROM "AiMcpDiscoverySnapshot"
    WHERE "serverCode" = ${serverCode}
    ORDER BY "discoveredAt" DESC
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    serverCode,
    version: row.version,
    tools: Array.isArray(row.toolsJson) ? row.toolsJson as McpDiscoverySnapshot["tools"] : [],
    resources: Array.isArray(row.resourcesJson) ? row.resourcesJson as McpDiscoverySnapshot["resources"] : [],
    prompts: Array.isArray(row.promptsJson) ? row.promptsJson as McpDiscoverySnapshot["prompts"] : [],
    discoveredAt: row.discoveredAt.toISOString(),
  };
}

export async function persistMcpDiscoverySnapshot(input: {
  snapshot: McpDiscoverySnapshot;
  compatible: boolean;
  change: unknown;
}) {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "AiMcpDiscoverySnapshot" (
      "id", "serverCode", "version", "toolsJson", "resourcesJson", "promptsJson", "compatible", "changeJson", "discoveredAt", "createdAt"
    ) VALUES (
      ${randomUUID()}, ${input.snapshot.serverCode}, ${input.snapshot.version}, ${jsonValue(input.snapshot.tools)}, ${jsonValue(input.snapshot.resources)},
      ${jsonValue(input.snapshot.prompts)}, ${input.compatible}, ${jsonValue(input.change)}, ${new Date(input.snapshot.discoveredAt)}, CURRENT_TIMESTAMP
    ) ON CONFLICT ("serverCode", "version") DO NOTHING
  `);
}

export async function writeMcpAuditEvent(input: {
  userId?: string | null;
  organizationId?: string | null;
  serverCode: string;
  dtscToolCode?: string | null;
  remoteToolName?: string | null;
  eventType: string;
  status: "SUCCESS" | "DENIED" | "FAILED" | "CHANGED";
  reasonCode?: string | null;
  metadata?: unknown;
}) {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "AiMcpAuditEvent" (
      "id", "userId", "organizationId", "serverCode", "dtscToolCode", "remoteToolName", "eventType", "status", "reasonCode", "metadataJson", "createdAt"
    ) VALUES (
      ${randomUUID()}, ${input.userId || null}, ${input.organizationId || null}, ${input.serverCode}, ${input.dtscToolCode || null},
      ${input.remoteToolName || null}, ${input.eventType}, ${input.status}, ${input.reasonCode || null}, ${input.metadata === undefined ? null : jsonValue(input.metadata)}, CURRENT_TIMESTAMP
    )
  `);
}
