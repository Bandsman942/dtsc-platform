import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { GAMING_SESSION_STATUSES } from "@/lib/enterprise/gaming/domain";
import { finalAmountFromGamingPricingSnapshot, resolveGamingPricingQuoteTx } from "@/lib/enterprise/gaming/pricing";
import type { gamingSessionStartSchema, gamingSessionTransitionSchema } from "@/lib/enterprise/gaming/schemas";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";

type StartInput = z.infer<typeof gamingSessionStartSchema>;
type TransitionInput = z.infer<typeof gamingSessionTransitionSchema>;
type Tx = Prisma.TransactionClient;

type SessionTimingSource = {
  status: string;
  startedAt: Date | null;
  expectedEndAt: Date | null;
  pausedAt: Date | null;
  endedAt: Date | null;
  pausedSeconds: number;
  billableSeconds: number | null;
  timingPolicyJson: Prisma.JsonValue | null;
};

const liveStatuses = ["ACTIVE", "PAUSED"] as const;

function clampPage(page: number) {
  return Math.max(1, Number.isFinite(page) ? Math.trunc(page) : 1);
}

function clampPageSize(pageSize: number) {
  return Math.min(100, Math.max(5, Number.isFinite(pageSize) ? Math.trunc(pageSize) : 20));
}

function nullableId(value: string | null | undefined) {
  const trimmed = value?.trim() || "";
  return trimmed || null;
}

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + Math.max(0, seconds) * 1000);
}

function addMinutes(date: Date, minutes: number) {
  return addSeconds(date, minutes * 60);
}

function secondsBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

function pauseBillable(policy: Prisma.JsonValue | null | undefined) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return false;
  return (policy as Record<string, unknown>).pauseBillable === true;
}

function timingProjection(session: SessionTimingSource, now: Date) {
  if (!session.startedAt) {
    return { elapsedSeconds: 0, pausedSeconds: session.pausedSeconds, billableSeconds: session.billableSeconds || 0, remainingSeconds: null };
  }

  const effectiveEnd = session.endedAt || now;
  const elapsedSeconds = secondsBetween(session.startedAt, effectiveEnd);
  const openPauseSeconds = session.status === "PAUSED" && session.pausedAt ? secondsBetween(session.pausedAt, now) : 0;
  const pausedSeconds = session.pausedSeconds + openPauseSeconds;
  const projectedBillable = session.billableSeconds ?? Math.max(0, elapsedSeconds - (pauseBillable(session.timingPolicyJson) ? 0 : pausedSeconds));

  let remainingSeconds: number | null = null;
  if (session.expectedEndAt && !session.endedAt) {
    const comparisonTime = session.status === "PAUSED" && session.pausedAt ? session.pausedAt : now;
    remainingSeconds = Math.max(0, secondsBetween(comparisonTime, session.expectedEndAt));
  }

  return { elapsedSeconds, pausedSeconds, billableSeconds: projectedBillable, remainingSeconds };
}

async function assertOptionalReferences(tx: Tx, organizationId: string, input: Pick<StartInput, "businessPartyId" | "serviceCatalogItemId">) {
  const businessPartyId = nullableId(input.businessPartyId);
  const serviceCatalogItemId = nullableId(input.serviceCatalogItemId);

  if (businessPartyId) {
    const customer = await tx.enterpriseBusinessParty.findFirst({
      where: {
        id: businessPartyId,
        organizationId,
        archivedAt: null,
        status: "ACTIVE",
        roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } },
      },
      select: { id: true },
    });
    if (!customer) throw new EnterpriseDomainError("GAMING_SESSION_CUSTOMER_NOT_FOUND", 404);
  }

  if (serviceCatalogItemId) {
    const catalogItem = await tx.enterpriseCatalogItem.findFirst({
      where: { id: serviceCatalogItemId, organizationId, archivedAt: null, status: "ACTIVE" },
      select: { id: true, itemType: true },
    });
    if (!catalogItem) throw new EnterpriseDomainError("GAMING_SESSION_CATALOG_ITEM_NOT_FOUND", 404);
    if (catalogItem.itemType !== "SERVICE") throw new EnterpriseDomainError("GAMING_SESSION_CATALOG_ITEM_NOT_SERVICE", 409);
  }
}

async function assertStationReady(tx: Tx, organizationId: string, stationId: string, excludeSessionId?: string) {
  const station = await tx.enterpriseGamingStationProfile.findFirst({
    where: { id: stationId, organizationId, archivedAt: null },
    select: { id: true, assetId: true, stationCode: true, displayName: true, status: true },
  });
  if (!station) throw new EnterpriseDomainError("GAMING_SESSION_STATION_NOT_FOUND", 404);
  if (station.status !== "AVAILABLE") throw new EnterpriseDomainError("GAMING_SESSION_STATION_BLOCKED", 409);

  const [asset, incident, maintenance, liveSession] = await Promise.all([
    tx.enterpriseAsset.findFirst({
      where: { id: station.assetId, organizationId },
      select: { id: true, status: true, archivedAt: true },
    }),
    tx.enterpriseAssetIncident.findFirst({
      where: { organizationId, assetId: station.assetId, archivedAt: null, status: "OPEN", severity: { in: ["HIGH", "CRITICAL"] } },
      select: { id: true },
    }),
    tx.enterpriseAssetMaintenance.findFirst({
      where: { organizationId, assetId: station.assetId, archivedAt: null, status: "IN_PROGRESS" },
      select: { id: true },
    }),
    tx.enterpriseGamingSession.findFirst({
      where: {
        organizationId,
        stationId,
        archivedAt: null,
        status: { in: [...liveStatuses] },
        ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
      },
      select: { id: true },
    }),
  ]);

  if (!asset || asset.archivedAt || asset.status === "DISPOSED") throw new EnterpriseDomainError("GAMING_SESSION_STATION_ASSET_UNAVAILABLE", 409);
  if (incident) throw new EnterpriseDomainError("GAMING_SESSION_STATION_INCIDENT", 409);
  if (maintenance) throw new EnterpriseDomainError("GAMING_SESSION_STATION_MAINTENANCE", 409);
  if (liveSession) throw new EnterpriseDomainError("GAMING_SESSION_STATION_BUSY", 409);
  return station;
}

function sessionInclude() {
  return {
    station: { select: { id: true, stationCode: true, displayName: true, consoleFamily: true, maxPlayers: true } },
    pricingRule: { select: { id: true, code: true, pricingMode: true, amount: true, currency: true } },
    transitions: {
      orderBy: { occurredAt: "desc" as const },
      take: 8,
      select: { id: true, action: true, fromStatus: true, toStatus: true, occurredAt: true, metadataJson: true },
    },
  };
}

async function catalogServiceMap(organizationId: string, serviceIds: Array<string | null>) {
  const ids = [...new Set(serviceIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map<string, { id: string; code: string; name: string }>();
  const services = await prisma.enterpriseCatalogItem.findMany({
    where: { organizationId, id: { in: ids } },
    select: { id: true, code: true, name: true },
  });
  return new Map(services.map((service) => [service.id, service]));
}

async function loadSessionResult(organizationId: string, sessionId: string) {
  const session = await prisma.enterpriseGamingSession.findFirst({
    where: { id: sessionId, organizationId, archivedAt: null },
    include: sessionInclude(),
  });
  if (!session) throw new EnterpriseDomainError("GAMING_SESSION_NOT_FOUND", 404);
  const services = await catalogServiceMap(organizationId, [session.serviceCatalogItemId]);
  const serverNow = new Date();
  return {
    ...session,
    catalogService: session.serviceCatalogItemId ? services.get(session.serviceCatalogItemId) || null : null,
    timing: timingProjection(session, serverNow),
    serverNow: serverNow.toISOString(),
  };
}

export async function listGamingSessions({
  organizationId,
  page,
  pageSize,
  search,
  status,
}: {
  organizationId: string;
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
}) {
  const safePage = clampPage(page);
  const safePageSize = clampPageSize(pageSize);
  const query = search?.trim() || "";
  const safeStatus = status && (GAMING_SESSION_STATUSES as readonly string[]).includes(status) ? status : "";
  const where: Prisma.EnterpriseGamingSessionWhereInput = {
    organizationId,
    archivedAt: null,
    ...(safeStatus ? { status: safeStatus } : {}),
    ...(query ? {
      OR: [
        { reference: { contains: query, mode: "insensitive" } },
        { station: { stationCode: { contains: query, mode: "insensitive" } } },
        { station: { displayName: { contains: query, mode: "insensitive" } } },
      ],
    } : {}),
  };

  const [items, total, grouped] = await Promise.all([
    prisma.enterpriseGamingSession.findMany({
      where,
      include: sessionInclude(),
      orderBy: [{ createdAt: "desc" }, { reference: "desc" }],
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    }),
    prisma.enterpriseGamingSession.count({ where }),
    prisma.enterpriseGamingSession.groupBy({
      by: ["status"],
      where: { organizationId, archivedAt: null },
      _count: { _all: true },
    }),
  ]);

  const services = await catalogServiceMap(organizationId, items.map((item) => item.serviceCatalogItemId));
  const serverNow = new Date();
  const metrics = Object.fromEntries(grouped.map((row) => [row.status, row._count._all])) as Record<string, number>;
  return {
    items: items.map((item) => ({
      ...item,
      catalogService: item.serviceCatalogItemId ? services.get(item.serviceCatalogItemId) || null : null,
      timing: timingProjection(item, serverNow),
    })),
    serverNow: serverNow.toISOString(),
    pagination: { page: safePage, pageSize: safePageSize, total, pageCount: Math.max(1, Math.ceil(total / safePageSize)) },
    metrics: {
      total: Object.values(metrics).reduce((sum, value) => sum + value, 0),
      active: metrics.ACTIVE || 0,
      paused: metrics.PAUSED || 0,
      ended: metrics.ENDED || 0,
      toCheckout: metrics.TO_CHECKOUT || 0,
    },
  };
}

export async function startGamingSession(
  organizationId: string,
  actorUserId: string,
  input: StartInput,
  options: { canOverridePricing?: boolean } = {},
) {
  const existing = await prisma.enterpriseGamingSession.findFirst({
    where: { organizationId, idempotencyKey: input.idempotencyKey },
    select: { id: true },
  });
  if (existing) return { session: await loadSessionResult(organizationId, existing.id), idempotent: true };

  const hasOverride = input.priceOverrideAmount !== undefined && input.priceOverrideAmount !== null;
  if (hasOverride && !options.canOverridePricing) throw new EnterpriseDomainError("GAMING_PRICING_OVERRIDE_FORBIDDEN", 403);

  try {
    const createdId = await prisma.$transaction(async (tx) => {
      const retry = await tx.enterpriseGamingSession.findFirst({
        where: { organizationId, idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });
      if (retry) return retry.id;

      await assertOptionalReferences(tx, organizationId, input);
      await assertStationReady(tx, organizationId, input.stationId);

      const now = new Date();
      const serviceCatalogItemId = nullableId(input.serviceCatalogItemId);
      let pricing: Awaited<ReturnType<typeof resolveGamingPricingQuoteTx>> | null = null;
      if (serviceCatalogItemId) {
        try {
          pricing = await resolveGamingPricingQuoteTx({
            tx,
            organizationId,
            serviceCatalogItemId,
            stationId: input.stationId,
            durationMinutes: input.durationMinutes,
            playerCount: input.playerCount,
            startAt: now,
            overrideAmount: input.priceOverrideAmount,
            overrideReason: input.priceOverrideReason,
            overrideByUserId: hasOverride ? actorUserId : null,
          });
        } catch (error) {
          if (error instanceof EnterpriseDomainError && error.code === "GAMING_PRICING_NO_MATCH") {
            throw new EnterpriseDomainError("GAMING_SESSION_PRICING_REQUIRED", 409);
          }
          throw error;
        }
      }

      const session = await tx.enterpriseGamingSession.create({
        data: {
          organizationId,
          reference: `GS-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`,
          stationId: input.stationId,
          businessPartyId: nullableId(input.businessPartyId),
          serviceCatalogItemId,
          pricingRuleId: pricing?.rule.id || null,
          pricingSnapshotJson: pricing?.snapshot as Prisma.InputJsonValue | undefined,
          currency: pricing?.currency || null,
          quotedAmount: pricing?.quotedAmount || null,
          status: "ACTIVE",
          startedAt: now,
          expectedEndAt: addMinutes(now, input.durationMinutes),
          pausedSeconds: 0,
          timingPolicyJson: {
            pauseBillable: input.pauseBillable,
            initialDurationMinutes: input.durationMinutes,
            authority: "SERVER",
            contractVersion: 1,
          },
          idempotencyKey: input.idempotencyKey,
          createdByUserId: actorUserId,
        },
      });

      await tx.enterpriseGamingSessionTransition.create({
        data: {
          organizationId,
          sessionId: session.id,
          action: "START",
          idempotencyKey: input.idempotencyKey,
          fromStatus: null,
          toStatus: "ACTIVE",
          actorUserId,
          metadataJson: {
            stationId: input.stationId,
            durationMinutes: input.durationMinutes,
            playerCount: input.playerCount,
            serviceCatalogItemId,
            pricingRuleId: pricing?.rule.id || null,
            currency: pricing?.currency || null,
            quotedAmount: pricing?.quotedAmount.toFixed(2) || null,
            pricingOverride: hasOverride,
          },
        },
      });
      return session.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { session: await loadSessionResult(organizationId, createdId), idempotent: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const retry = await prisma.enterpriseGamingSession.findFirst({
        where: { organizationId, idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });
      if (retry) return { session: await loadSessionResult(organizationId, retry.id), idempotent: true };
      throw new EnterpriseDomainError("GAMING_SESSION_STATION_BUSY", 409);
    }
    throw error;
  }
}

export async function transitionGamingSession(
  organizationId: string,
  sessionId: string,
  actorUserId: string,
  input: TransitionInput,
) {
  const previous = await prisma.enterpriseGamingSessionTransition.findFirst({
    where: { organizationId, idempotencyKey: input.idempotencyKey },
    select: { sessionId: true },
  });
  if (previous) {
    if (previous.sessionId !== sessionId) throw new EnterpriseDomainError("GAMING_SESSION_IDEMPOTENCY_CONFLICT", 409);
    return { session: await loadSessionResult(organizationId, sessionId), idempotent: true };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const retry = await tx.enterpriseGamingSessionTransition.findFirst({
        where: { organizationId, idempotencyKey: input.idempotencyKey },
        select: { sessionId: true },
      });
      if (retry) {
        if (retry.sessionId !== sessionId) throw new EnterpriseDomainError("GAMING_SESSION_IDEMPOTENCY_CONFLICT", 409);
        return;
      }

      const session = await tx.enterpriseGamingSession.findFirst({
        where: { id: sessionId, organizationId, archivedAt: null },
      });
      if (!session) throw new EnterpriseDomainError("GAMING_SESSION_NOT_FOUND", 404);
      if (session.revision !== input.revision) throw new EnterpriseDomainConflictError();
      if (["ENDED", "TO_CHECKOUT", "PAID", "CANCELLED"].includes(session.status)) {
        throw new EnterpriseDomainError("GAMING_SESSION_TERMINAL", 409);
      }

      const now = new Date();
      let nextStatus = session.status;
      let metadata: Prisma.InputJsonValue = {};
      let data: Prisma.EnterpriseGamingSessionUncheckedUpdateManyInput = {
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      };

      if (input.action === "PAUSE") {
        if (session.status !== "ACTIVE") throw new EnterpriseDomainError("GAMING_SESSION_NOT_ACTIVE", 409);
        nextStatus = "PAUSED";
        data = { ...data, status: "PAUSED", pausedAt: now };
      } else if (input.action === "RESUME") {
        if (session.status !== "PAUSED" || !session.pausedAt) throw new EnterpriseDomainError("GAMING_SESSION_NOT_PAUSED", 409);
        const pauseSeconds = secondsBetween(session.pausedAt, now);
        nextStatus = "ACTIVE";
        data = {
          ...data,
          status: "ACTIVE",
          pausedAt: null,
          pausedSeconds: { increment: pauseSeconds },
          ...(!pauseBillable(session.timingPolicyJson) && session.expectedEndAt ? { expectedEndAt: addSeconds(session.expectedEndAt, pauseSeconds) } : {}),
        };
        metadata = { pauseSeconds };
      } else if (input.action === "EXTEND") {
        if (!liveStatuses.includes(session.status as (typeof liveStatuses)[number])) throw new EnterpriseDomainError("GAMING_SESSION_NOT_LIVE", 409);
        if (!session.expectedEndAt || !input.extensionMinutes) throw new EnterpriseDomainError("GAMING_SESSION_EXTENSION_INVALID", 400);
        data = { ...data, expectedEndAt: addMinutes(session.expectedEndAt, input.extensionMinutes) };
        metadata = { extensionMinutes: input.extensionMinutes };
      } else if (input.action === "TRANSFER") {
        if (!liveStatuses.includes(session.status as (typeof liveStatuses)[number])) throw new EnterpriseDomainError("GAMING_SESSION_NOT_LIVE", 409);
        if (!input.targetStationId || input.targetStationId === session.stationId) throw new EnterpriseDomainError("GAMING_SESSION_TRANSFER_INVALID", 400);
        await assertStationReady(tx, organizationId, input.targetStationId, session.id);
        data = { ...data, stationId: input.targetStationId };
        metadata = { fromStationId: session.stationId, toStationId: input.targetStationId };
      } else if (input.action === "END") {
        if (!liveStatuses.includes(session.status as (typeof liveStatuses)[number]) || !session.startedAt) throw new EnterpriseDomainError("GAMING_SESSION_NOT_LIVE", 409);
        const openPauseSeconds = session.status === "PAUSED" && session.pausedAt ? secondsBetween(session.pausedAt, now) : 0;
        const totalPausedSeconds = session.pausedSeconds + openPauseSeconds;
        const elapsedSeconds = secondsBetween(session.startedAt, now);
        const billableSeconds = Math.max(0, elapsedSeconds - (pauseBillable(session.timingPolicyJson) ? 0 : totalPausedSeconds));
        const finalPricing = finalAmountFromGamingPricingSnapshot(session.pricingSnapshotJson, billableSeconds);
        nextStatus = "ENDED";
        data = {
          ...data,
          status: "ENDED",
          endedAt: now,
          pausedAt: null,
          pausedSeconds: totalPausedSeconds,
          billableSeconds,
          ...(finalPricing ? { finalAmount: finalPricing.amount, currency: finalPricing.currency } : {}),
        };
        metadata = {
          elapsedSeconds,
          pausedSeconds: totalPausedSeconds,
          billableSeconds,
          currency: finalPricing?.currency || session.currency,
          finalAmount: finalPricing?.amount.toFixed(2) || null,
          pricingAuthority: finalPricing ? "SNAPSHOT" : null,
        };
      }

      const updated = await tx.enterpriseGamingSession.updateMany({
        where: { id: session.id, organizationId, archivedAt: null, revision: input.revision, status: session.status },
        data,
      });
      if (updated.count !== 1) throw new EnterpriseDomainConflictError();

      await tx.enterpriseGamingSessionTransition.create({
        data: {
          organizationId,
          sessionId: session.id,
          action: input.action,
          idempotencyKey: input.idempotencyKey,
          fromStatus: session.status,
          toStatus: nextStatus,
          actorUserId,
          metadataJson: metadata,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { session: await loadSessionResult(organizationId, sessionId), idempotent: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const retry = await prisma.enterpriseGamingSessionTransition.findFirst({
        where: { organizationId, idempotencyKey: input.idempotencyKey },
        select: { sessionId: true },
      });
      if (retry?.sessionId === sessionId) return { session: await loadSessionResult(organizationId, sessionId), idempotent: true };
      if (input.action === "TRANSFER") throw new EnterpriseDomainError("GAMING_SESSION_STATION_BUSY", 409);
      throw new EnterpriseDomainError("GAMING_SESSION_IDEMPOTENCY_CONFLICT", 409);
    }
    throw error;
  }
}
