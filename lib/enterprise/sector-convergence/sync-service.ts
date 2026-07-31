import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseSectorConvergenceError } from "@/lib/enterprise/sector-convergence/errors";
import type { SectorConvergenceFlag } from "@/lib/enterprise/sector-convergence/flags";

export type SectorSyncIdentity = {
  organizationId: string;
  sector: "PHARMACY" | "HEALTH_CARE";
  sourceEntityType: string;
  sourceEntityId: string;
  eventType?: string;
  eventVersion?: number;
};

export function sectorIdempotencyKey(identity: SectorSyncIdentity) {
  const value = [
    identity.organizationId,
    identity.sector,
    identity.sourceEntityType,
    identity.sourceEntityId,
    identity.eventType || "ENTITY_MAPPING",
    identity.eventVersion || 1,
  ].join(":");
  return `sector:${createHash("sha256").update(value).digest("hex")}`;
}

export async function beginSectorSync(
  tx: Prisma.TransactionClient,
  identity: SectorSyncIdentity,
  metadataJson?: Prisma.InputJsonValue,
) {
  const eventType = identity.eventType || "ENTITY_MAPPING";
  const eventVersion = identity.eventVersion || 1;
  const idempotencyKey = sectorIdempotencyKey({ ...identity, eventType, eventVersion });
  return tx.enterpriseSectorSyncState.upsert({
    where: { organizationId_idempotencyKey: { organizationId: identity.organizationId, idempotencyKey } },
    update: { lastAttemptAt: new Date(), metadataJson },
    create: {
      organizationId: identity.organizationId,
      sector: identity.sector,
      sourceEntityType: identity.sourceEntityType,
      sourceEntityId: identity.sourceEntityId,
      eventType,
      eventVersion,
      idempotencyKey,
      status: "PENDING",
      lastAttemptAt: new Date(),
      metadataJson,
    },
  });
}

export async function completeSectorSync(
  tx: Prisma.TransactionClient,
  syncStateId: string,
  target: { targetEntityType: string; targetEntityId: string; cutoverComplete?: boolean; metadataJson?: Prisma.InputJsonValue },
) {
  return tx.enterpriseSectorSyncState.update({
    where: { id: syncStateId },
    data: {
      targetEntityType: target.targetEntityType,
      targetEntityId: target.targetEntityId,
      status: target.cutoverComplete ? "CUTOVER_COMPLETE" : "SYNCED",
      lastSyncedVersion: { increment: 1 },
      errorCode: null,
      errorMessage: null,
      requiresManualAction: false,
      cutoverComplete: Boolean(target.cutoverComplete),
      completedAt: new Date(),
      metadataJson: target.metadataJson,
    },
  });
}

export async function failSectorSync({
  organizationId,
  syncStateId,
  status = "FAILED",
  errorCode,
  errorMessage,
  requiresManualAction = false,
}: {
  organizationId: string;
  syncStateId: string;
  status?: "FAILED" | "AMBIGUOUS" | "LEGACY_UNMAPPED";
  errorCode: string;
  errorMessage?: string;
  requiresManualAction?: boolean;
}) {
  return prisma.enterpriseSectorSyncState.updateMany({
    where: { id: syncStateId, organizationId },
    data: {
      status,
      errorCode,
      errorMessage: errorMessage?.slice(0, 1000),
      requiresManualAction,
      lastAttemptAt: new Date(),
    },
  });
}

export async function listSectorConvergenceStatus({
  organizationId,
  sector,
  status,
  sourceEntityType,
  requiresManualAction,
  page,
  pageSize,
}: {
  organizationId: string;
  sector?: "PHARMACY" | "HEALTH_CARE";
  status?: string;
  sourceEntityType?: string;
  requiresManualAction?: boolean;
  page: number;
  pageSize: number;
}) {
  const where = {
    organizationId,
    ...(sector ? { sector } : {}),
    ...(status ? { status } : {}),
    ...(sourceEntityType ? { sourceEntityType } : {}),
    ...(requiresManualAction === undefined ? {} : { requiresManualAction }),
  };
  const [items, total, counts, cutovers] = await Promise.all([
    prisma.enterpriseSectorSyncState.findMany({
      where,
      orderBy: [{ requiresManualAction: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        sector: true,
        sourceEntityType: true,
        sourceEntityId: true,
        targetEntityType: true,
        targetEntityId: true,
        eventType: true,
        eventVersion: true,
        status: true,
        errorCode: true,
        errorMessage: true,
        requiresManualAction: true,
        cutoverComplete: true,
        lastAttemptAt: true,
        completedAt: true,
        updatedAt: true,
      },
    }),
    prisma.enterpriseSectorSyncState.count({ where }),
    prisma.enterpriseSectorSyncState.groupBy({
      by: ["sector", "status"],
      where: { organizationId },
      _count: { _all: true },
    }),
    prisma.enterpriseSectorCutoverState.findMany({
      where: { organizationId },
      orderBy: [{ sector: "asc" }, { domainCode: "asc" }],
    }),
  ]);
  return { items, counts, cutovers, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } };
}

export async function retrySectorSync(organizationId: string, syncStateId: string, expectedStatus: "FAILED" | "PENDING") {
  const result = await prisma.enterpriseSectorSyncState.updateMany({
    where: { id: syncStateId, organizationId, status: expectedStatus },
    data: { status: "PENDING", errorCode: null, errorMessage: null, requiresManualAction: false, lastAttemptAt: new Date() },
  });
  if (result.count !== 1) throw new EnterpriseSectorConvergenceError("SYNC_STATE_CONFLICT", 409);
  return prisma.enterpriseSectorSyncState.findUniqueOrThrow({ where: { id: syncStateId } });
}

export async function resolveSectorSync({
  organizationId,
  syncStateId,
  targetEntityType,
  targetEntityId,
  resolutionReason,
  expectedStatus,
}: {
  organizationId: string;
  syncStateId: string;
  targetEntityType: string;
  targetEntityId: string;
  resolutionReason: string;
  expectedStatus: "AMBIGUOUS" | "LEGACY_UNMAPPED";
}) {
  return prisma.$transaction(async (tx) => {
    const state = await tx.enterpriseSectorSyncState.findFirst({ where: { id: syncStateId, organizationId, status: expectedStatus } });
    if (!state) throw new EnterpriseSectorConvergenceError("SYNC_STATE_CONFLICT", 409);
    return tx.enterpriseSectorSyncState.update({
      where: { id: state.id },
      data: {
        targetEntityType,
        targetEntityId,
        status: "PENDING",
        errorCode: null,
        errorMessage: null,
        requiresManualAction: false,
        metadataJson: { resolutionReason: resolutionReason.slice(0, 1000), previousStatus: expectedStatus },
        lastAttemptAt: new Date(),
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function transitionSectorCutover({
  organizationId,
  sector,
  domainCode,
  featureFlag,
  action,
  actorUserId,
  reason,
  revision,
}: {
  organizationId: string;
  sector: "PHARMACY" | "HEALTH_CARE";
  domainCode: string;
  featureFlag: SectorConvergenceFlag;
  action: "ENABLE" | "COMPLETE" | "DISABLE";
  actorUserId: string;
  reason?: string;
  revision?: number;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseSectorCutoverState.findUnique({ where: { organizationId_sector_domainCode: { organizationId, sector, domainCode } } });
    if (existing && revision && existing.revision !== revision) throw new EnterpriseSectorConvergenceError("CUTOVER_REVISION_CONFLICT", 409, { currentRevision: existing.revision });
    const status = action === "ENABLE" ? "ENABLED" : action === "COMPLETE" ? "CUTOVER_COMPLETE" : "DISABLED";
    if (action === "DISABLE" && !reason) throw new EnterpriseSectorConvergenceError("ROLLBACK_REASON_REQUIRED", 400);
    return tx.enterpriseSectorCutoverState.upsert({
      where: { organizationId_sector_domainCode: { organizationId, sector, domainCode } },
      update: {
        status,
        featureFlag,
        enabledByUserId: action === "ENABLE" ? actorUserId : existing?.enabledByUserId,
        enabledAt: action === "ENABLE" ? new Date() : existing?.enabledAt,
        disabledByUserId: action === "DISABLE" ? actorUserId : null,
        disabledAt: action === "DISABLE" ? new Date() : null,
        verifiedAt: action === "COMPLETE" ? new Date() : existing?.verifiedAt,
        rollbackReason: action === "DISABLE" ? reason?.slice(0, 1000) : null,
        revision: { increment: 1 },
      },
      create: {
        organizationId,
        sector,
        domainCode,
        featureFlag,
        status,
        enabledByUserId: action === "ENABLE" ? actorUserId : null,
        enabledAt: action === "ENABLE" ? new Date() : null,
        disabledByUserId: action === "DISABLE" ? actorUserId : null,
        disabledAt: action === "DISABLE" ? new Date() : null,
        verifiedAt: action === "COMPLETE" ? new Date() : null,
        rollbackReason: action === "DISABLE" ? reason?.slice(0, 1000) : null,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
