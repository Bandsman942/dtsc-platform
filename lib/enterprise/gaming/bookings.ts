import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { GAMING_BOOKING_STATUSES } from "@/lib/enterprise/gaming/domain";
import { resolveGamingPricingQuoteTx } from "@/lib/enterprise/gaming/pricing";
import type { gamingBookingCreateSchema, gamingBookingTransitionSchema } from "@/lib/enterprise/gaming/schemas";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";

type CreateInput = z.infer<typeof gamingBookingCreateSchema>;
type TransitionInput = z.infer<typeof gamingBookingTransitionSchema>;
type Tx = Prisma.TransactionClient;

const blockingStatuses = ["CONFIRMED", "CHECKED_IN"] as const;
const terminalStatuses = ["NO_SHOW", "CANCELLED", "CONVERTED"] as const;
const maxBookingDurationMs = 24 * 60 * 60 * 1000;

const bookingInclude = {
  station: {
    select: {
      id: true,
      assetId: true,
      stationCode: true,
      displayName: true,
      consoleFamily: true,
      maxPlayers: true,
      status: true,
    },
  },
  session: {
    select: { id: true, reference: true, status: true, startedAt: true, expectedEndAt: true },
  },
  transitions: {
    orderBy: { occurredAt: "desc" as const },
    take: 12,
    select: { id: true, action: true, fromStatus: true, toStatus: true, occurredAt: true, metadataJson: true },
  },
} satisfies Prisma.EnterpriseGamingBookingInclude;

type BookingRow = Prisma.EnterpriseGamingBookingGetPayload<{ include: typeof bookingInclude }>;

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

function assertSchedule(start: Date, end: Date) {
  const durationMs = end.getTime() - start.getTime();
  if (durationMs <= 0 || durationMs > maxBookingDurationMs) {
    throw new EnterpriseDomainError("GAMING_BOOKING_SCHEDULE_INVALID", 400);
  }
}

function durationMinutes(start: Date, end: Date) {
  assertSchedule(start, end);
  return Math.ceil((end.getTime() - start.getTime()) / 60_000);
}

async function lockBookingStations(tx: Tx, organizationId: string, stationIds: string[]) {
  const ids = [...new Set(stationIds.filter(Boolean))].sort();
  for (const stationId of ids) {
    const key = `${organizationId}:gaming-booking:${stationId}`;
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)`);
  }
}

async function assertCustomer(tx: Tx, organizationId: string, businessPartyId: string | null) {
  if (!businessPartyId) return;
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
  if (!customer) throw new EnterpriseDomainError("GAMING_BOOKING_CUSTOMER_NOT_FOUND", 404);
}

async function assertBookableStation(tx: Tx, organizationId: string, stationId: string, playerCount: number) {
  const station = await tx.enterpriseGamingStationProfile.findFirst({
    where: { id: stationId, organizationId, archivedAt: null },
    select: { id: true, assetId: true, stationCode: true, displayName: true, maxPlayers: true, status: true },
  });
  if (!station) throw new EnterpriseDomainError("GAMING_BOOKING_STATION_NOT_FOUND", 404);
  if (playerCount > station.maxPlayers) throw new EnterpriseDomainError("GAMING_BOOKING_PLAYER_CAPACITY", 409);

  const asset = await tx.enterpriseAsset.findFirst({
    where: { id: station.assetId, organizationId },
    select: { id: true, status: true, archivedAt: true },
  });
  if (!asset || asset.archivedAt || asset.status === "DISPOSED" || station.status === "OUT_OF_SERVICE") {
    throw new EnterpriseDomainError("GAMING_BOOKING_STATION_UNAVAILABLE", 409);
  }
  return station;
}

async function assertNoConflict(
  tx: Tx,
  organizationId: string,
  stationId: string,
  scheduledStartAt: Date,
  scheduledEndAt: Date,
  excludeBookingId?: string,
) {
  const conflict = await tx.enterpriseGamingBooking.findFirst({
    where: {
      organizationId,
      stationId,
      archivedAt: null,
      status: { in: [...blockingStatuses] },
      scheduledStartAt: { lt: scheduledEndAt },
      scheduledEndAt: { gt: scheduledStartAt },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: { id: true },
  });
  if (conflict) throw new EnterpriseDomainError("GAMING_BOOKING_CONFLICT", 409);
}

async function assertStationReadyForConversion(tx: Tx, organizationId: string, stationId: string) {
  const station = await tx.enterpriseGamingStationProfile.findFirst({
    where: { id: stationId, organizationId, archivedAt: null },
    select: { id: true, assetId: true, status: true },
  });
  if (!station) throw new EnterpriseDomainError("GAMING_BOOKING_STATION_NOT_FOUND", 404);
  if (station.status !== "AVAILABLE") throw new EnterpriseDomainError("GAMING_BOOKING_STATION_BUSY", 409);

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
      where: { organizationId, stationId, archivedAt: null, status: { in: ["ACTIVE", "PAUSED"] } },
      select: { id: true },
    }),
  ]);

  if (!asset || asset.archivedAt || asset.status === "DISPOSED") throw new EnterpriseDomainError("GAMING_BOOKING_STATION_UNAVAILABLE", 409);
  if (incident) throw new EnterpriseDomainError("GAMING_BOOKING_STATION_INCIDENT", 409);
  if (maintenance) throw new EnterpriseDomainError("GAMING_BOOKING_STATION_MAINTENANCE", 409);
  if (liveSession) throw new EnterpriseDomainError("GAMING_BOOKING_STATION_BUSY", 409);
}

async function enrichBookings(organizationId: string, rows: BookingRow[]) {
  const partyIds = [...new Set(rows.map((row) => row.businessPartyId).filter((value): value is string => Boolean(value)))];
  const assetIds = [...new Set(rows.map((row) => row.station.assetId))];
  const [parties, assets] = await Promise.all([
    partyIds.length
      ? prisma.enterpriseBusinessParty.findMany({
          where: { organizationId, id: { in: partyIds } },
          select: { id: true, code: true, legalName: true, displayName: true, status: true, archivedAt: true },
        })
      : Promise.resolve([]),
    assetIds.length
      ? prisma.enterpriseAsset.findMany({
          where: { organizationId, id: { in: assetIds } },
          select: { id: true, siteId: true, site: { select: { id: true, name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const partyMap = new Map(parties.map((party) => [party.id, party]));
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  return rows.map((row) => ({
    ...row,
    customer: row.businessPartyId ? partyMap.get(row.businessPartyId) || null : null,
    site: assetMap.get(row.station.assetId)?.site || null,
  }));
}

async function loadBookingResult(organizationId: string, bookingId: string) {
  const booking = await prisma.enterpriseGamingBooking.findFirst({
    where: { id: bookingId, organizationId, archivedAt: null },
    include: bookingInclude,
  });
  if (!booking) throw new EnterpriseDomainError("GAMING_BOOKING_NOT_FOUND", 404);
  const [result] = await enrichBookings(organizationId, [booking]);
  return result;
}

export async function listGamingBookings({
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
  const safeStatus = status && (GAMING_BOOKING_STATUSES as readonly string[]).includes(status) ? status : "";

  const matchingPartyIds = query
    ? (await prisma.enterpriseBusinessParty.findMany({
        where: {
          organizationId,
          archivedAt: null,
          roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } },
          OR: [
            { legalName: { contains: query, mode: "insensitive" } },
            { displayName: { contains: query, mode: "insensitive" } },
            { code: { contains: query, mode: "insensitive" } },
          ],
        },
        select: { id: true },
        take: 100,
      })).map((party) => party.id)
    : [];

  const where: Prisma.EnterpriseGamingBookingWhereInput = {
    organizationId,
    archivedAt: null,
    ...(safeStatus ? { status: safeStatus } : {}),
    ...(query
      ? {
          OR: [
            { reference: { contains: query, mode: "insensitive" } },
            { station: { stationCode: { contains: query, mode: "insensitive" } } },
            { station: { displayName: { contains: query, mode: "insensitive" } } },
            ...(matchingPartyIds.length ? [{ businessPartyId: { in: matchingPartyIds } }] : []),
          ],
        }
      : {}),
  };

  const [rows, total, grouped] = await Promise.all([
    prisma.enterpriseGamingBooking.findMany({
      where,
      include: bookingInclude,
      orderBy: [{ scheduledStartAt: "desc" }, { createdAt: "desc" }],
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    }),
    prisma.enterpriseGamingBooking.count({ where }),
    prisma.enterpriseGamingBooking.groupBy({
      by: ["status"],
      where: { organizationId, archivedAt: null },
      _count: { _all: true },
    }),
  ]);

  const items = await enrichBookings(organizationId, rows);
  const counts = Object.fromEntries(grouped.map((row) => [row.status, row._count._all])) as Record<string, number>;
  return {
    items,
    pagination: { page: safePage, pageSize: safePageSize, total, pageCount: Math.max(1, Math.ceil(total / safePageSize)) },
    metrics: {
      total: Object.values(counts).reduce((sum, value) => sum + value, 0),
      draft: counts.DRAFT || 0,
      confirmed: counts.CONFIRMED || 0,
      checkedIn: counts.CHECKED_IN || 0,
      converted: counts.CONVERTED || 0,
      noShow: counts.NO_SHOW || 0,
    },
  };
}

function bookingConflictFromDatabase(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("GAMING_BOOKING_CONFLICT");
}

export async function createGamingBooking(organizationId: string, actorUserId: string, input: CreateInput) {
  const existing = await prisma.enterpriseGamingBooking.findFirst({
    where: { organizationId, idempotencyKey: input.idempotencyKey },
    select: { id: true },
  });
  if (existing) return { booking: await loadBookingResult(organizationId, existing.id), idempotent: true };

  try {
    const bookingId = await prisma.$transaction(async (tx) => {
      const retry = await tx.enterpriseGamingBooking.findFirst({
        where: { organizationId, idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });
      if (retry) return retry.id;

      assertSchedule(input.scheduledStartAt, input.scheduledEndAt);
      const businessPartyId = nullableId(input.businessPartyId);
      await assertCustomer(tx, organizationId, businessPartyId);
      await assertBookableStation(tx, organizationId, input.stationId, input.playerCount);

      if (input.status === "CONFIRMED") {
        await lockBookingStations(tx, organizationId, [input.stationId]);
        await assertNoConflict(tx, organizationId, input.stationId, input.scheduledStartAt, input.scheduledEndAt);
      }

      const now = new Date();
      const booking = await tx.enterpriseGamingBooking.create({
        data: {
          organizationId,
          reference: `GB-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`,
          stationId: input.stationId,
          businessPartyId,
          scheduledStartAt: input.scheduledStartAt,
          scheduledEndAt: input.scheduledEndAt,
          playerCount: input.playerCount,
          status: input.status,
          notes: input.notes?.trim() || null,
          confirmedAt: input.status === "CONFIRMED" ? now : null,
          idempotencyKey: input.idempotencyKey,
          createdByUserId: actorUserId,
        },
      });

      await tx.enterpriseGamingBookingTransition.create({
        data: {
          organizationId,
          bookingId: booking.id,
          action: "CREATE",
          idempotencyKey: input.idempotencyKey,
          fromStatus: null,
          toStatus: input.status,
          actorUserId,
          metadataJson: { stationId: input.stationId, scheduledStartAt: input.scheduledStartAt.toISOString(), scheduledEndAt: input.scheduledEndAt.toISOString() },
        },
      });
      return booking.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { booking: await loadBookingResult(organizationId, bookingId), idempotent: false };
  } catch (error) {
    if (bookingConflictFromDatabase(error)) throw new EnterpriseDomainError("GAMING_BOOKING_CONFLICT", 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new EnterpriseDomainError("GAMING_BOOKING_CONFLICT", 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const retry = await prisma.enterpriseGamingBooking.findFirst({
        where: { organizationId, idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });
      if (retry) return { booking: await loadBookingResult(organizationId, retry.id), idempotent: true };
      throw new EnterpriseDomainError("GAMING_BOOKING_IDEMPOTENCY_CONFLICT", 409);
    }
    throw error;
  }
}

export async function transitionGamingBooking(
  organizationId: string,
  bookingId: string,
  actorUserId: string,
  input: TransitionInput,
) {
  const previous = await prisma.enterpriseGamingBookingTransition.findFirst({
    where: { organizationId, idempotencyKey: input.idempotencyKey },
    select: { bookingId: true },
  });
  if (previous) {
    if (previous.bookingId !== bookingId) throw new EnterpriseDomainError("GAMING_BOOKING_IDEMPOTENCY_CONFLICT", 409);
    return { booking: await loadBookingResult(organizationId, bookingId), idempotent: true };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const retry = await tx.enterpriseGamingBookingTransition.findFirst({
        where: { organizationId, idempotencyKey: input.idempotencyKey },
        select: { bookingId: true },
      });
      if (retry) {
        if (retry.bookingId !== bookingId) throw new EnterpriseDomainError("GAMING_BOOKING_IDEMPOTENCY_CONFLICT", 409);
        return;
      }

      const booking = await tx.enterpriseGamingBooking.findFirst({
        where: { id: bookingId, organizationId, archivedAt: null },
        include: { session: { select: { id: true } } },
      });
      if (!booking) throw new EnterpriseDomainError("GAMING_BOOKING_NOT_FOUND", 404);
      if (booking.revision !== input.revision) throw new EnterpriseDomainConflictError();
      if (terminalStatuses.includes(booking.status as (typeof terminalStatuses)[number])) {
        throw new EnterpriseDomainError("GAMING_BOOKING_TERMINAL", 409);
      }

      const now = new Date();
      let nextStatus = booking.status;
      let metadata: Prisma.InputJsonValue = {};
      let data: Prisma.EnterpriseGamingBookingUncheckedUpdateManyInput = {
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      };

      if (input.action === "UPDATE") {
        if (!["DRAFT", "CONFIRMED"].includes(booking.status)) throw new EnterpriseDomainError("GAMING_BOOKING_TERMINAL", 409);
        const stationId = input.stationId || booking.stationId;
        const scheduledStartAt = input.scheduledStartAt || booking.scheduledStartAt;
        const scheduledEndAt = input.scheduledEndAt || booking.scheduledEndAt;
        const playerCount = input.playerCount ?? booking.playerCount;
        const customerProvided = Object.prototype.hasOwnProperty.call(input, "businessPartyId");
        const businessPartyId = customerProvided ? nullableId(input.businessPartyId) : booking.businessPartyId;
        assertSchedule(scheduledStartAt, scheduledEndAt);

        await assertCustomer(tx, organizationId, businessPartyId);
        await assertBookableStation(tx, organizationId, stationId, playerCount);
        if (booking.status === "CONFIRMED") {
          await lockBookingStations(tx, organizationId, [booking.stationId, stationId]);
          await assertNoConflict(tx, organizationId, stationId, scheduledStartAt, scheduledEndAt, booking.id);
        }

        data = {
          ...data,
          stationId,
          businessPartyId,
          scheduledStartAt,
          scheduledEndAt,
          playerCount,
          ...(Object.prototype.hasOwnProperty.call(input, "notes") ? { notes: input.notes?.trim() || null } : {}),
        };
        metadata = { stationId, scheduledStartAt: scheduledStartAt.toISOString(), scheduledEndAt: scheduledEndAt.toISOString(), playerCount };
      } else if (input.action === "CONFIRM") {
        if (booking.status !== "DRAFT") throw new EnterpriseDomainError("GAMING_BOOKING_CONFIRM_INVALID", 409);
        assertSchedule(booking.scheduledStartAt, booking.scheduledEndAt);
        await assertCustomer(tx, organizationId, booking.businessPartyId);
        await assertBookableStation(tx, organizationId, booking.stationId, booking.playerCount);
        await lockBookingStations(tx, organizationId, [booking.stationId]);
        await assertNoConflict(tx, organizationId, booking.stationId, booking.scheduledStartAt, booking.scheduledEndAt, booking.id);
        nextStatus = "CONFIRMED";
        data = { ...data, status: "CONFIRMED", confirmedAt: now };
      } else if (input.action === "CHECK_IN") {
        if (booking.status !== "CONFIRMED") throw new EnterpriseDomainError("GAMING_BOOKING_CHECK_IN_INVALID", 409);
        assertSchedule(booking.scheduledStartAt, booking.scheduledEndAt);
        await lockBookingStations(tx, organizationId, [booking.stationId]);
        await assertNoConflict(tx, organizationId, booking.stationId, booking.scheduledStartAt, booking.scheduledEndAt, booking.id);
        nextStatus = "CHECKED_IN";
        data = { ...data, status: "CHECKED_IN", checkedInAt: now };
      } else if (input.action === "NO_SHOW") {
        if (booking.status !== "CONFIRMED") throw new EnterpriseDomainError("GAMING_BOOKING_NO_SHOW_INVALID", 409);
        nextStatus = "NO_SHOW";
        data = { ...data, status: "NO_SHOW", noShowAt: now };
      } else if (input.action === "CANCEL") {
        if (!["DRAFT", "CONFIRMED", "CHECKED_IN"].includes(booking.status)) throw new EnterpriseDomainError("GAMING_BOOKING_CANCEL_INVALID", 409);
        nextStatus = "CANCELLED";
        data = { ...data, status: "CANCELLED", cancelledAt: now };
      } else if (input.action === "CONVERT") {
        if (booking.status !== "CHECKED_IN") throw new EnterpriseDomainError("GAMING_BOOKING_CONVERT_INVALID", 409);
        if (booking.session) throw new EnterpriseDomainError("GAMING_BOOKING_SESSION_EXISTS", 409);
        if (!input.serviceCatalogItemId) throw new EnterpriseDomainError("GAMING_BOOKING_PRICING_SERVICE_REQUIRED", 400);

        await lockBookingStations(tx, organizationId, [booking.stationId]);
        await assertCustomer(tx, organizationId, booking.businessPartyId);
        await assertStationReadyForConversion(tx, organizationId, booking.stationId);

        const minutes = durationMinutes(booking.scheduledStartAt, booking.scheduledEndAt);
        const pricing = await resolveGamingPricingQuoteTx({
          tx,
          organizationId,
          serviceCatalogItemId: input.serviceCatalogItemId,
          stationId: booking.stationId,
          durationMinutes: minutes,
          playerCount: booking.playerCount,
          startAt: now,
        });
        const sessionKey = `BOOKING:${input.idempotencyKey}`;
        const session = await tx.enterpriseGamingSession.create({
          data: {
            organizationId,
            reference: `GS-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`,
            stationId: booking.stationId,
            bookingId: booking.id,
            businessPartyId: booking.businessPartyId,
            serviceCatalogItemId: input.serviceCatalogItemId,
            pricingRuleId: pricing.rule.id,
            status: "ACTIVE",
            startedAt: now,
            expectedEndAt: new Date(now.getTime() + minutes * 60_000),
            pausedSeconds: 0,
            timingPolicyJson: { pauseBillable: false, initialDurationMinutes: minutes, authority: "SERVER", source: "BOOKING", contractVersion: 1 },
            pricingSnapshotJson: pricing.snapshot,
            currency: pricing.currency,
            quotedAmount: pricing.quotedAmount,
            idempotencyKey: sessionKey,
            createdByUserId: actorUserId,
          },
        });

        await tx.enterpriseGamingSessionTransition.create({
          data: {
            organizationId,
            sessionId: session.id,
            action: "START",
            idempotencyKey: sessionKey,
            fromStatus: null,
            toStatus: "ACTIVE",
            actorUserId,
            metadataJson: {
              stationId: booking.stationId,
              bookingId: booking.id,
              durationMinutes: minutes,
              serviceCatalogItemId: input.serviceCatalogItemId,
              pricingRuleId: pricing.rule.id,
              currency: pricing.currency,
              quotedAmount: pricing.quotedAmount.toFixed(2),
            },
          },
        });

        nextStatus = "CONVERTED";
        data = { ...data, status: "CONVERTED", convertedAt: now };
        metadata = {
          sessionId: session.id,
          sessionReference: session.reference,
          durationMinutes: minutes,
          serviceCatalogItemId: input.serviceCatalogItemId,
          pricingRuleId: pricing.rule.id,
          currency: pricing.currency,
          quotedAmount: pricing.quotedAmount.toFixed(2),
        };
      }

      const updated = await tx.enterpriseGamingBooking.updateMany({
        where: { id: booking.id, organizationId, revision: booking.revision, status: booking.status },
        data,
      });
      if (updated.count !== 1) throw new EnterpriseDomainConflictError();

      await tx.enterpriseGamingBookingTransition.create({
        data: {
          organizationId,
          bookingId: booking.id,
          action: input.action,
          idempotencyKey: input.idempotencyKey,
          fromStatus: booking.status,
          toStatus: nextStatus,
          actorUserId,
          metadataJson: metadata,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { booking: await loadBookingResult(organizationId, bookingId), idempotent: false };
  } catch (error) {
    if (bookingConflictFromDatabase(error)) throw new EnterpriseDomainError("GAMING_BOOKING_CONFLICT", 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new EnterpriseDomainConflictError();
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const retry = await prisma.enterpriseGamingBookingTransition.findFirst({
        where: { organizationId, idempotencyKey: input.idempotencyKey },
        select: { bookingId: true },
      });
      if (retry?.bookingId === bookingId) return { booking: await loadBookingResult(organizationId, bookingId), idempotent: true };
      if (input.action === "CONVERT") {
        const session = await prisma.enterpriseGamingSession.findFirst({
          where: { organizationId, bookingId },
          select: { id: true },
        });
        if (session) throw new EnterpriseDomainError("GAMING_BOOKING_SESSION_EXISTS", 409);
      }
      throw new EnterpriseDomainError("GAMING_BOOKING_IDEMPOTENCY_CONFLICT", 409);
    }
    throw error;
  }
}
