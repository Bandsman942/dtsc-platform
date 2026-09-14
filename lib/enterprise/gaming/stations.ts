import { Prisma } from "@prisma/client";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { GAMING_STATION_STATUSES } from "@/lib/enterprise/gaming/domain";
import type { gamingStationCreateSchema, gamingStationUpdateSchema } from "@/lib/enterprise/gaming/schemas";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";

type CreateInput = z.infer<typeof gamingStationCreateSchema>;
type UpdateInput = z.infer<typeof gamingStationUpdateSchema>;

type StationRow = { id: string; effectiveStatus: string };
type CountRow = { count: number };
type MetricRow = { effectiveStatus: string; count: number };
type CandidateIdRow = { id: string };

const blockingSessionStatuses = ["WAITING", "ACTIVE", "PAUSED"];
const blockingBookingStatuses = ["CONFIRMED", "CHECKED_IN"];

function clampPage(page: number) {
  return Math.max(1, Number.isFinite(page) ? Math.trunc(page) : 1);
}

function clampPageSize(pageSize: number) {
  return Math.min(100, Math.max(5, Number.isFinite(pageSize) ? Math.trunc(pageSize) : 20));
}

function normalizeStationCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizedNullable(value: string | null | undefined) {
  if (value === undefined) return undefined;
  const trimmed = value?.trim() || "";
  return trimmed || null;
}

const effectiveStatusSql = Prisma.sql`
  CASE
    WHEN a."archivedAt" IS NOT NULL OR a."status" = 'DISPOSED' THEN 'OUT_OF_SERVICE'
    WHEN EXISTS (
      SELECT 1 FROM "EnterpriseAssetIncident" i
      WHERE i."organizationId" = g."organizationId"
        AND i."assetId" = g."assetId"
        AND i."archivedAt" IS NULL
        AND i."status" = 'OPEN'
        AND i."severity" IN ('HIGH', 'CRITICAL')
    ) THEN 'OUT_OF_SERVICE'
    WHEN EXISTS (
      SELECT 1 FROM "EnterpriseAssetMaintenance" m
      WHERE m."organizationId" = g."organizationId"
        AND m."assetId" = g."assetId"
        AND m."archivedAt" IS NULL
        AND m."status" = 'IN_PROGRESS'
    ) THEN 'MAINTENANCE'
    ELSE g."status"
  END
`;

export async function listGamingStations({
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
  const offset = (safePage - 1) * safePageSize;
  const query = search?.trim() || "";
  const like = `%${query}%`;
  const safeStatus = status && (GAMING_STATION_STATUSES as readonly string[]).includes(status) ? status : "";
  const searchClause = query
    ? Prisma.sql`AND (
        g."stationCode" ILIKE ${like}
        OR COALESCE(g."displayName", '') ILIKE ${like}
        OR COALESCE(g."consoleFamily", '') ILIKE ${like}
        OR a."code" ILIKE ${like}
        OR a."name" ILIKE ${like}
        OR COALESCE(a."serialNumber", '') ILIKE ${like}
      )`
    : Prisma.sql``;
  const statusClause = safeStatus ? Prisma.sql`AND ${effectiveStatusSql} = ${safeStatus}` : Prisma.sql``;

  const [rows, countRows, metricRows] = await Promise.all([
    prisma.$queryRaw<StationRow[]>(Prisma.sql`
      SELECT g."id", ${effectiveStatusSql} AS "effectiveStatus"
      FROM "EnterpriseGamingStationProfile" g
      INNER JOIN "EnterpriseAsset" a
        ON a."organizationId" = g."organizationId" AND a."id" = g."assetId"
      WHERE g."organizationId" = ${organizationId}
        AND g."archivedAt" IS NULL
        ${searchClause}
        ${statusClause}
      ORDER BY g."sortOrder" ASC, g."stationCode" ASC, g."createdAt" ASC
      LIMIT ${safePageSize} OFFSET ${offset}
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::int AS "count"
      FROM "EnterpriseGamingStationProfile" g
      INNER JOIN "EnterpriseAsset" a
        ON a."organizationId" = g."organizationId" AND a."id" = g."assetId"
      WHERE g."organizationId" = ${organizationId}
        AND g."archivedAt" IS NULL
        ${searchClause}
        ${statusClause}
    `),
    prisma.$queryRaw<MetricRow[]>(Prisma.sql`
      SELECT ${effectiveStatusSql} AS "effectiveStatus", COUNT(*)::int AS "count"
      FROM "EnterpriseGamingStationProfile" g
      INNER JOIN "EnterpriseAsset" a
        ON a."organizationId" = g."organizationId" AND a."id" = g."assetId"
      WHERE g."organizationId" = ${organizationId}
        AND g."archivedAt" IS NULL
      GROUP BY ${effectiveStatusSql}
    `),
  ]);

  const ids = rows.map((row) => row.id);
  const profiles = ids.length
    ? await prisma.enterpriseGamingStationProfile.findMany({
        where: { organizationId, id: { in: ids }, archivedAt: null },
      })
    : [];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const assetIds = profiles.map((profile) => profile.assetId);
  const assets = assetIds.length
    ? await prisma.enterpriseAsset.findMany({
        where: { organizationId, id: { in: assetIds } },
        select: {
          id: true,
          code: true,
          name: true,
          serialNumber: true,
          status: true,
          condition: true,
          archivedAt: true,
          site: { select: { id: true, code: true, name: true } },
          category: { select: { id: true, code: true, name: true } },
          incidents: {
            where: { archivedAt: null, status: "OPEN", severity: { in: ["HIGH", "CRITICAL"] } },
            orderBy: { reportedAt: "desc" },
            take: 1,
            select: { id: true, reference: true, severity: true, title: true },
          },
          maintenanceRecords: {
            where: { archivedAt: null, status: "IN_PROGRESS" },
            orderBy: { startedAt: "desc" },
            take: 1,
            select: { id: true, reference: true, title: true },
          },
        },
      })
    : [];
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const effectiveById = new Map(rows.map((row) => [row.id, row.effectiveStatus]));

  const items = ids.flatMap((id) => {
    const profile = profileById.get(id);
    if (!profile) return [];
    const asset = assetById.get(profile.assetId);
    if (!asset) return [];
    return [{
      ...profile,
      effectiveStatus: effectiveById.get(id) || profile.status,
      asset: {
        id: asset.id,
        code: asset.code,
        name: asset.name,
        serialNumber: asset.serialNumber,
        status: asset.status,
        condition: asset.condition,
        archivedAt: asset.archivedAt,
        site: asset.site,
        category: asset.category,
      },
      blockers: {
        incident: asset.incidents[0] || null,
        maintenance: asset.maintenanceRecords[0] || null,
      },
    }];
  });

  const total = countRows[0]?.count || 0;
  const metrics = Object.fromEntries(metricRows.map((row) => [row.effectiveStatus, row.count])) as Record<string, number>;
  return {
    items,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / safePageSize)),
    },
    metrics: {
      total: Object.values(metrics).reduce((sum, value) => sum + value, 0),
      available: metrics.AVAILABLE || 0,
      inUse: metrics.IN_USE || 0,
      reserved: metrics.RESERVED || 0,
      maintenance: metrics.MAINTENANCE || 0,
      outOfService: metrics.OUT_OF_SERVICE || 0,
    },
  };
}

export async function listGamingStationCandidates({
  organizationId,
  page,
  pageSize,
  search,
}: {
  organizationId: string;
  page: number;
  pageSize: number;
  search?: string;
}) {
  const safePage = clampPage(page);
  const safePageSize = clampPageSize(pageSize);
  const offset = (safePage - 1) * safePageSize;
  const query = search?.trim() || "";
  const like = `%${query}%`;
  const searchClause = query
    ? Prisma.sql`AND (a."code" ILIKE ${like} OR a."name" ILIKE ${like} OR COALESCE(a."serialNumber", '') ILIKE ${like})`
    : Prisma.sql``;

  const [idRows, countRows] = await Promise.all([
    prisma.$queryRaw<CandidateIdRow[]>(Prisma.sql`
      SELECT a."id"
      FROM "EnterpriseAsset" a
      WHERE a."organizationId" = ${organizationId}
        AND a."archivedAt" IS NULL
        AND a."status" <> 'DISPOSED'
        AND NOT EXISTS (
          SELECT 1 FROM "EnterpriseGamingStationProfile" g
          WHERE g."organizationId" = a."organizationId" AND g."assetId" = a."id"
        )
        ${searchClause}
      ORDER BY a."name" ASC, a."code" ASC
      LIMIT ${safePageSize} OFFSET ${offset}
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::int AS "count"
      FROM "EnterpriseAsset" a
      WHERE a."organizationId" = ${organizationId}
        AND a."archivedAt" IS NULL
        AND a."status" <> 'DISPOSED'
        AND NOT EXISTS (
          SELECT 1 FROM "EnterpriseGamingStationProfile" g
          WHERE g."organizationId" = a."organizationId" AND g."assetId" = a."id"
        )
        ${searchClause}
    `),
  ]);

  const ids = idRows.map((row) => row.id);
  const assets = ids.length
    ? await prisma.enterpriseAsset.findMany({
        where: { organizationId, id: { in: ids }, archivedAt: null },
        select: {
          id: true,
          code: true,
          name: true,
          serialNumber: true,
          status: true,
          condition: true,
          site: { select: { id: true, code: true, name: true } },
          category: { select: { id: true, code: true, name: true } },
        },
      })
    : [];
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const total = countRows[0]?.count || 0;
  return {
    items: ids.flatMap((id) => byId.get(id) ? [byId.get(id)] : []),
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / safePageSize)),
    },
  };
}

async function assertAssetCanBackStation(organizationId: string, assetId: string) {
  const asset = await prisma.enterpriseAsset.findFirst({
    where: { id: assetId, organizationId, archivedAt: null },
    select: { id: true, status: true },
  });
  if (!asset) throw new EnterpriseDomainError("GAMING_STATION_ASSET_NOT_FOUND", 404);
  if (asset.status === "DISPOSED") throw new EnterpriseDomainError("GAMING_STATION_ASSET_DISPOSED", 409);
  return asset;
}

export async function createGamingStation(organizationId: string, actorUserId: string, input: CreateInput) {
  await assertAssetCanBackStation(organizationId, input.assetId);
  const stationCode = normalizeStationCode(input.stationCode);
  const existing = await prisma.enterpriseGamingStationProfile.findFirst({
    where: {
      organizationId,
      OR: [{ assetId: input.assetId }, { stationCode }],
    },
    select: { assetId: true, stationCode: true, archivedAt: true },
  });
  if (existing?.assetId === input.assetId) throw new EnterpriseDomainError("GAMING_STATION_ASSET_ALREADY_LINKED", 409);
  if (existing?.stationCode === stationCode) throw new EnterpriseDomainError("GAMING_STATION_CODE_DUPLICATE", 409);

  return prisma.enterpriseGamingStationProfile.create({
    data: {
      organizationId,
      assetId: input.assetId,
      stationCode,
      displayName: normalizedNullable(input.displayName),
      consoleFamily: input.consoleFamily.trim(),
      maxPlayers: input.maxPlayers,
      sortOrder: input.sortOrder,
      status: "AVAILABLE",
      notes: normalizedNullable(input.notes),
      createdByUserId: actorUserId,
    },
  });
}

async function loadStationForMutation(organizationId: string, stationId: string) {
  const station = await prisma.enterpriseGamingStationProfile.findFirst({
    where: { id: stationId, organizationId, archivedAt: null },
  });
  if (!station) throw new EnterpriseDomainError("GAMING_STATION_NOT_FOUND", 404);
  const asset = await prisma.enterpriseAsset.findFirst({
    where: { id: station.assetId, organizationId },
    select: { id: true, status: true, archivedAt: true },
  });
  if (!asset) throw new EnterpriseDomainError("GAMING_STATION_ASSET_NOT_FOUND", 404);
  return { station, asset };
}

async function assertStationCanBecomeAvailable(organizationId: string, assetId: string) {
  const [asset, incident, maintenance] = await Promise.all([
    prisma.enterpriseAsset.findFirst({
      where: { id: assetId, organizationId },
      select: { status: true, archivedAt: true },
    }),
    prisma.enterpriseAssetIncident.findFirst({
      where: { organizationId, assetId, archivedAt: null, status: "OPEN", severity: { in: ["HIGH", "CRITICAL"] } },
      select: { id: true },
    }),
    prisma.enterpriseAssetMaintenance.findFirst({
      where: { organizationId, assetId, archivedAt: null, status: "IN_PROGRESS" },
      select: { id: true },
    }),
  ]);
  if (!asset || asset.archivedAt || asset.status === "DISPOSED") throw new EnterpriseDomainError("GAMING_STATION_ASSET_UNAVAILABLE", 409);
  if (incident) throw new EnterpriseDomainError("GAMING_STATION_BLOCKED_BY_INCIDENT", 409);
  if (maintenance) throw new EnterpriseDomainError("GAMING_STATION_BLOCKED_BY_MAINTENANCE", 409);
}

export async function updateGamingStation(
  organizationId: string,
  stationId: string,
  actorUserId: string,
  input: UpdateInput,
) {
  const { station } = await loadStationForMutation(organizationId, stationId);

  if (input.action === "ARCHIVE") {
    const [session, booking] = await Promise.all([
      prisma.enterpriseGamingSession.findFirst({
        where: { organizationId, stationId, archivedAt: null, status: { in: blockingSessionStatuses } },
        select: { id: true },
      }),
      prisma.enterpriseGamingBooking.findFirst({
        where: { organizationId, stationId, archivedAt: null, status: { in: blockingBookingStatuses } },
        select: { id: true },
      }),
    ]);
    if (session) throw new EnterpriseDomainError("GAMING_STATION_HAS_LIVE_SESSION", 409);
    if (booking) throw new EnterpriseDomainError("GAMING_STATION_HAS_ACTIVE_BOOKING", 409);
    const archived = await prisma.enterpriseGamingStationProfile.updateMany({
      where: { id: station.id, organizationId, archivedAt: null, revision: input.revision },
      data: { archivedAt: new Date(), updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (archived.count !== 1) throw new EnterpriseDomainConflictError();
    return { id: station.id, archived: true };
  }

  if (input.action === "SET_AVAILABLE") {
    await assertStationCanBecomeAvailable(organizationId, station.assetId);
  }

  if (input.action === "UPDATE" && input.stationCode) {
    const stationCode = normalizeStationCode(input.stationCode);
    const duplicate = await prisma.enterpriseGamingStationProfile.findFirst({
      where: { organizationId, stationCode, id: { not: station.id } },
      select: { id: true },
    });
    if (duplicate) throw new EnterpriseDomainError("GAMING_STATION_CODE_DUPLICATE", 409);
  }

  const data: Prisma.EnterpriseGamingStationProfileUpdateManyMutationInput = input.action === "UPDATE"
    ? {
        ...(input.stationCode !== undefined ? { stationCode: normalizeStationCode(input.stationCode) } : {}),
        ...(input.displayName !== undefined ? { displayName: normalizedNullable(input.displayName) } : {}),
        ...(input.consoleFamily !== undefined ? { consoleFamily: input.consoleFamily.trim() } : {}),
        ...(input.maxPlayers !== undefined ? { maxPlayers: input.maxPlayers } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.notes !== undefined ? { notes: normalizedNullable(input.notes) } : {}),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      }
    : {
        status: input.action === "BLOCK" ? "OUT_OF_SERVICE" : "AVAILABLE",
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      };

  const updated = await prisma.enterpriseGamingStationProfile.updateMany({
    where: { id: station.id, organizationId, archivedAt: null, revision: input.revision },
    data,
  });
  if (updated.count !== 1) throw new EnterpriseDomainConflictError();
  return prisma.enterpriseGamingStationProfile.findFirstOrThrow({ where: { id: station.id, organizationId } });
}
