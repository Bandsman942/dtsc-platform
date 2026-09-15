import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  EnterpriseGamingCheckoutError,
  gamingMoney,
  uniqueValues,
} from "@/lib/enterprise/gaming/checkout-common";
import type {
  gamingDailyCloseCreateSchema,
  gamingDailyCloseDecisionSchema,
} from "@/lib/enterprise/gaming/checkout-schemas";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";

type CloseCreateInput = z.infer<typeof gamingDailyCloseCreateSchema>;
type CloseDecisionInput = z.infer<typeof gamingDailyCloseDecisionSchema>;
type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function safeTimezone(value: string | null | undefined) {
  const candidate = value?.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "UTC";
  }
}

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function zoneOffsetMs(date: Date, timeZone: string) {
  const parts = localParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

function zonedDateToUtc(parts: Omit<LocalParts, "second"> & { second?: number }, timeZone: string) {
  const guessed = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
  let candidate = new Date(guessed - zoneOffsetMs(new Date(guessed), timeZone));
  candidate = new Date(guessed - zoneOffsetMs(candidate, timeZone));
  return candidate;
}

function selectedCalendarDate(value: Date) {
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

function nextCalendarDate(value: { year: number; month: number; day: number }) {
  const next = new Date(Date.UTC(value.year, value.month - 1, value.day + 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function businessWindow(date: Date, timeZone: string) {
  const local = selectedCalendarDate(date);
  const next = nextCalendarDate(local);
  return {
    start: zonedDateToUtc({ ...local, hour: 0, minute: 0, second: 0 }, timeZone),
    end: zonedDateToUtc({ ...next, hour: 0, minute: 0, second: 0 }, timeZone),
  };
}

function baseCheckoutReference(reference: string | null) {
  if (!reference) return null;
  return reference.endsWith(":REFUND") ? reference.slice(0, -":REFUND".length) : reference;
}

export async function createGamingDailyClose(
  organizationId: string,
  actorUserId: string,
  input: CloseCreateInput,
) {
  const existingKey = await prisma.enterpriseGamingDailyClose.findFirst({
    where: { organizationId, idempotencyKey: input.idempotencyKey },
    include: { lines: true },
  });
  if (existingKey) return { close: existingKey, idempotent: true };

  const site = input.siteId
    ? await prisma.enterpriseSite.findFirst({
        where: { id: input.siteId, organizationId, status: "ACTIVE", archivedAt: null },
        select: { id: true, timezone: true },
      })
    : null;
  if (input.siteId && !site) throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_SITE_INVALID", 409);
  const timezone = safeTimezone(site?.timezone);
  const { start, end } = businessWindow(input.businessDate, timezone);
  const scopeKey = input.siteId || "ALL";

  const declarationKeys = input.declarations.map((item) => `${item.financialAccountId}:${item.methodType}`);
  if (uniqueValues(declarationKeys).length !== declarationKeys.length) {
    throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_DUPLICATE_SCOPE", 400);
  }
  const accountIds = uniqueValues(input.declarations.map((item) => item.financialAccountId));
  const accounts = await prisma.enterpriseFinancialAccount.findMany({
    where: { organizationId, id: { in: accountIds }, status: "ACTIVE", archivedAt: null },
  });
  if (accounts.length !== accountIds.length) {
    throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_FINANCIAL_ACCOUNT_INVALID", 409);
  }
  if (input.siteId && accounts.some((account) => account.siteId && account.siteId !== input.siteId)) {
    throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_FINANCIAL_ACCOUNT_SITE_MISMATCH", 409);
  }
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  try {
    const close = await prisma.$transaction(async (tx) => {
      const lockKey = `${organizationId}:gaming-daily-close:${scopeKey}:${start.toISOString()}`;
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`);
      const retry = await tx.enterpriseGamingDailyClose.findFirst({
        where: { organizationId, idempotencyKey: input.idempotencyKey },
        include: { lines: true },
      });
      if (retry) return retry;
      const duplicate = await tx.enterpriseGamingDailyClose.findFirst({
        where: {
          organizationId,
          businessDate: start,
          siteId: input.siteId || null,
          status: { in: ["SUBMITTED", "VALIDATED"] },
        },
        select: { id: true },
      });
      if (duplicate) throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_ALREADY_EXISTS", 409, { closeId: duplicate.id });

      const siteAssetIds = input.siteId
        ? (await tx.enterpriseAsset.findMany({
            where: { organizationId, siteId: input.siteId, archivedAt: null },
            select: { id: true },
          })).map((asset) => asset.id)
        : null;
      const stationIds = siteAssetIds
        ? (siteAssetIds.length
            ? (await tx.enterpriseGamingStationProfile.findMany({
                where: { organizationId, assetId: { in: siteAssetIds }, archivedAt: null },
                select: { id: true },
              })).map((station) => station.id)
            : [])
        : null;
      const sessionScope: Prisma.EnterpriseGamingSessionWhereInput = {
        organizationId,
        archivedAt: null,
        endedAt: { gte: start, lt: end },
        ...(stationIds ? { stationId: { in: stationIds } } : {}),
      };
      const endedSessions = await tx.enterpriseGamingSession.findMany({
        where: sessionScope,
        select: { id: true, status: true },
      });
      const endedSessionIds = endedSessions.map((session) => session.id);
      const dayCheckouts = endedSessionIds.length
        ? await tx.enterpriseGamingCheckout.findMany({
            where: { organizationId, sessionId: { in: endedSessionIds } },
            select: { id: true, reference: true, status: true, sessionId: true },
          })
        : [];

      const dayPayments = await tx.enterprisePayment.findMany({
        where: {
          organizationId,
          financialAccountId: { in: accountIds },
          status: { in: ["CONFIRMED", "RECONCILED"] },
          paymentDate: { gte: start, lt: end },
          OR: [
            { paymentType: "CUSTOMER_PAYMENT", direction: "INBOUND" },
            { paymentType: "REFUND", direction: "OUTBOUND" },
          ],
        },
      });
      const candidateCheckoutRefs = uniqueValues(
        dayPayments
          .map((payment) => baseCheckoutReference(payment.reference))
          .filter((reference): reference is string => Boolean(reference)),
      );
      const financialCheckouts = candidateCheckoutRefs.length
        ? await tx.enterpriseGamingCheckout.findMany({
            where: {
              organizationId,
              reference: { in: candidateCheckoutRefs },
              ...(stationIds ? { session: { stationId: { in: stationIds } } } : {}),
            },
            select: { reference: true },
          })
        : [];
      const financialCheckoutRefs = new Set(financialCheckouts.map((checkout) => checkout.reference));
      const relevantPayments = dayPayments.filter((payment) => {
        const reference = baseCheckoutReference(payment.reference);
        return Boolean(reference && financialCheckoutRefs.has(reference));
      });

      const paymentIds = relevantPayments.map((payment) => payment.id);
      const cashMovements = paymentIds.length
        ? await tx.enterpriseCashMovement.findMany({
            where: { organizationId, paymentId: { in: paymentIds } },
            select: { paymentId: true, cashSessionId: true },
          })
        : [];
      const cashSessionIdsByPayment = new Map<string, string[]>();
      for (const movement of cashMovements) {
        if (!movement.paymentId) continue;
        const ids = cashSessionIdsByPayment.get(movement.paymentId) || [];
        ids.push(movement.cashSessionId);
        cashSessionIdsByPayment.set(movement.paymentId, ids);
      }

      const lines = input.declarations.map((declaration) => {
        const account = accountById.get(declaration.financialAccountId)!;
        const scoped = relevantPayments.filter((payment) => (
          payment.financialAccountId === account.id && payment.methodType === declaration.methodType
        ));
        const inbound = scoped.filter((payment) => payment.paymentType === "CUSTOMER_PAYMENT" && payment.direction === "INBOUND");
        const refunds = scoped.filter((payment) => payment.paymentType === "REFUND" && payment.direction === "OUTBOUND");
        const inboundAmount = gamingMoney(inbound.reduce((total, payment) => total.plus(payment.amount), new Prisma.Decimal(0)));
        const refundAmount = gamingMoney(refunds.reduce((total, payment) => total.plus(payment.amount), new Prisma.Decimal(0)));
        const expectedAmount = gamingMoney(inboundAmount.minus(refundAmount));
        const declaredAmount = gamingMoney(declaration.declaredAmount);
        const differenceAmount = gamingMoney(declaredAmount.minus(expectedAmount));
        if (!differenceAmount.isZero() && !declaration.varianceReason?.trim()) {
          throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_VARIANCE_REASON_REQUIRED", 409, {
            financialAccountId: account.id,
            currency: account.currencyCode,
            expected: expectedAmount.toFixed(),
            declared: declaredAmount.toFixed(),
          });
        }
        const linePaymentIds = scoped.map((payment) => payment.id);
        const cashSessionIds = uniqueValues(
          linePaymentIds.flatMap((paymentId) => cashSessionIdsByPayment.get(paymentId) || []),
        );
        return {
          organizationId,
          financialAccountId: account.id,
          methodType: declaration.methodType,
          accountType: account.accountType,
          currencyCode: account.currencyCode,
          cashSessionId: cashSessionIds.length === 1 ? cashSessionIds[0] : null,
          paymentCount: inbound.length,
          refundCount: refunds.length,
          inboundAmount,
          refundAmount,
          expectedAmount,
          declaredAmount,
          differenceAmount,
          varianceReason: declaration.varianceReason?.trim() || null,
        };
      });

      return tx.enterpriseGamingDailyClose.create({
        data: {
          organizationId,
          reference: `GDC-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`,
          businessDate: start,
          siteId: input.siteId || null,
          timezone,
          status: "SUBMITTED",
          endedSessionCount: endedSessions.length,
          paidSessionCount: endedSessions.filter((session) => session.status === "PAID").length,
          pendingCheckoutCount: dayCheckouts.filter((checkout) => ["INVOICE_PENDING", "AWAITING_PAYMENT", "PARTIALLY_PAID", "REFUND_PENDING"].includes(checkout.status)).length,
          refundedCheckoutCount: dayCheckouts.filter((checkout) => checkout.status === "REFUNDED").length,
          submittedByUserId: actorUserId,
          notes: input.notes || null,
          idempotencyKey: input.idempotencyKey,
          lines: { create: lines },
        },
        include: { lines: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
    return { close, idempotent: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const retry = await prisma.enterpriseGamingDailyClose.findFirst({
        where: { organizationId, idempotencyKey: input.idempotencyKey },
        include: { lines: true },
      });
      if (retry) return { close: retry, idempotent: true };
      throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_ALREADY_EXISTS", 409);
    }
    throw error;
  }
}

export async function decideGamingDailyClose(
  organizationId: string,
  closeId: string,
  actorUserId: string,
  input: CloseDecisionInput,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseGamingDailyClose" WHERE id = ${closeId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const close = await tx.enterpriseGamingDailyClose.findFirst({
      where: { id: closeId, organizationId },
      include: { lines: true },
    });
    if (!close) throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_NOT_FOUND", 404);
    if (close.revision !== input.revision) {
      throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_REVISION_CONFLICT", 409, { currentRevision: close.revision });
    }
    if (close.status !== "SUBMITTED") throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_ALREADY_DECIDED", 409);
    if (close.submittedByUserId === actorUserId) {
      throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_SELF_VALIDATION_FORBIDDEN", 403);
    }
    const nextStatus = input.action === "VALIDATE" ? "VALIDATED" : "REJECTED";
    return tx.enterpriseGamingDailyClose.update({
      where: { id: close.id },
      data: {
        status: nextStatus,
        validatedByUserId: actorUserId,
        validatedAt: input.action === "VALIDATE" ? new Date() : null,
        rejectedAt: input.action === "REJECT" ? new Date() : null,
        rejectionReason: input.action === "REJECT" ? input.reason || null : null,
        revision: { increment: 1 },
      },
      include: { lines: true },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listGamingDailyCloses(
  organizationId: string,
  input: { page: number; pageSize: number; status?: string; siteId?: string },
) {
  const page = Math.max(1, Math.trunc(input.page || 1));
  const pageSize = Math.min(100, Math.max(5, Math.trunc(input.pageSize || 20)));
  const where: Prisma.EnterpriseGamingDailyCloseWhereInput = {
    organizationId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.siteId ? { siteId: input.siteId } : {}),
  };
  const [items, total, grouped] = await Promise.all([
    prisma.enterpriseGamingDailyClose.findMany({
      where,
      include: { lines: true },
      orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.enterpriseGamingDailyClose.count({ where }),
    prisma.enterpriseGamingDailyClose.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true },
    }),
  ]);
  return {
    items,
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    metrics: Object.fromEntries(grouped.map((row) => [row.status, row._count._all])),
  };
}

export async function getGamingDailyClose(organizationId: string, closeId: string) {
  const close = await prisma.enterpriseGamingDailyClose.findFirst({
    where: { id: closeId, organizationId },
    include: { lines: true },
  });
  if (!close) throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_NOT_FOUND", 404);
  return close;
}
