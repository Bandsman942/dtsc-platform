import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { assertEnterpriseCurrencyActiveTx, listEnterpriseCurrencies } from "@/lib/enterprise/accounting/currency-service";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { GAMING_PRICING_MODES, GAMING_PRICING_RULE_STATUSES, type GamingPricingMode } from "@/lib/enterprise/gaming/domain";
import type { gamingPricingRuleCreateSchema, gamingPricingRuleUpdateSchema, gamingPricingSimulationSchema } from "@/lib/enterprise/gaming/schemas";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";

type Tx = Prisma.TransactionClient;
type CreateInput = z.infer<typeof gamingPricingRuleCreateSchema>;
type UpdateInput = z.infer<typeof gamingPricingRuleUpdateSchema>;
type SimulationInput = z.infer<typeof gamingPricingSimulationSchema>;

type PricingRuleExtension = {
  consoleFamily: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  label: string | null;
};

export type GamingPricingSnapshot = {
  contractVersion: 1;
  authority: "SERVER";
  pricingRuleId: string;
  pricingRuleCode: string;
  serviceCatalogItemId: string;
  serviceCode: string;
  serviceName: string;
  stationId: string;
  stationCode: string;
  consoleFamily: string | null;
  playerCount: number;
  pricingMode: GamingPricingMode;
  currency: string;
  unitAmount: string;
  quotedAmount: string;
  requestedDurationMinutes: number;
  fixedDurationMinutes: number | null;
  billingIncrementMinutes: number;
  startAt: string;
  timezone: string;
  localWeekday: string;
  localMinuteOfDay: number;
  rulePriority: number;
  overrideAmount: string | null;
  overrideReason: string | null;
  overrideByUserId: string | null;
};

const weekdayBits: Record<string, number> = {
  Sun: 1,
  Mon: 2,
  Tue: 4,
  Wed: 8,
  Thu: 16,
  Fri: 32,
  Sat: 64,
};

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

function money(value: Prisma.Decimal.Value) {
  return decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function clampPage(page: number) {
  return Math.max(1, Number.isFinite(page) ? Math.trunc(page) : 1);
}

function clampPageSize(pageSize: number) {
  return Math.min(100, Math.max(5, Number.isFinite(pageSize) ? Math.trunc(pageSize) : 20));
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim() || "";
  return trimmed || null;
}

function normalizeCurrency(value: string) {
  return value.trim().toUpperCase();
}

function ruleExtension(value: Prisma.JsonValue | null | undefined): PricingRuleExtension {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { consoleFamily: null, minPlayers: null, maxPlayers: null, label: null };
  }
  const record = value as Record<string, unknown>;
  return {
    consoleFamily: typeof record.consoleFamily === "string" && record.consoleFamily.trim() ? record.consoleFamily.trim() : null,
    minPlayers: typeof record.minPlayers === "number" && Number.isInteger(record.minPlayers) ? record.minPlayers : null,
    maxPlayers: typeof record.maxPlayers === "number" && Number.isInteger(record.maxPlayers) ? record.maxPlayers : null,
    label: typeof record.label === "string" && record.label.trim() ? record.label.trim() : null,
  };
}

function extensionJson(extension: PricingRuleExtension): Prisma.InputJsonValue {
  return {
    consoleFamily: extension.consoleFamily,
    minPlayers: extension.minPlayers,
    maxPlayers: extension.maxPlayers,
    label: extension.label,
    contractVersion: 1,
  };
}

function billingIncrement(mode: GamingPricingMode, configured: number | null) {
  if (configured && configured > 0) return configured;
  return mode === "PER_HOUR" ? 60 : 1;
}

function quoteForDuration(mode: GamingPricingMode, amount: Prisma.Decimal, durationMinutes: number, incrementMinutes: number) {
  if (mode === "FIXED_DURATION" || mode === "PACKAGE") return money(amount);
  const roundedMinutes = Math.max(incrementMinutes, Math.ceil(durationMinutes / incrementMinutes) * incrementMinutes);
  if (mode === "PER_MINUTE") return money(amount.mul(roundedMinutes));
  return money(amount.mul(roundedMinutes).div(60));
}

function safeTimezone(value: string | null | undefined) {
  const candidate = value?.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "UTC";
  }
}

function localPricingParts(at: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(at);
  const weekday = parts.find((part) => part.type === "weekday")?.value || "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return { weekday, weekdayBit: weekdayBits[weekday] || 1, minuteOfDay: hour * 60 + minute };
}

function matchesMinuteRange(minuteOfDay: number, start: number | null, end: number | null) {
  if (start === null || end === null) return true;
  if (start === end) return true;
  if (start < end) return minuteOfDay >= start && minuteOfDay < end;
  return minuteOfDay >= start || minuteOfDay < end;
}

function specificity(rule: {
  stationId: string | null;
  durationMinutes: number | null;
  dayOfWeekMask: number | null;
  startMinuteOfDay: number | null;
  endMinuteOfDay: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
  ruleJson: Prisma.JsonValue | null;
}) {
  const extension = ruleExtension(rule.ruleJson);
  let score = 0;
  if (rule.stationId) score += 64;
  if (extension.consoleFamily) score += 32;
  if (extension.minPlayers !== null || extension.maxPlayers !== null) score += 16;
  if (rule.durationMinutes) score += 8;
  if (rule.dayOfWeekMask) score += 4;
  if (rule.startMinuteOfDay !== null && rule.endMinuteOfDay !== null) score += 2;
  if (rule.validFrom || rule.validUntil) score += 1;
  return score;
}

async function assertCatalogService(tx: Tx, organizationId: string, serviceCatalogItemId: string) {
  const service = await tx.enterpriseCatalogItem.findFirst({
    where: { id: serviceCatalogItemId, organizationId, archivedAt: null, status: "ACTIVE" },
    select: { id: true, code: true, name: true, itemType: true, currency: true, indicativeSalePrice: true },
  });
  if (!service) throw new EnterpriseDomainError("GAMING_PRICING_SERVICE_NOT_FOUND", 404);
  if (service.itemType !== "SERVICE") throw new EnterpriseDomainError("GAMING_PRICING_SERVICE_NOT_SERVICE", 409);
  return service;
}

async function assertPricingStation(tx: Tx, organizationId: string, stationId: string | null | undefined) {
  if (!stationId) return null;
  const station = await tx.enterpriseGamingStationProfile.findFirst({
    where: { id: stationId, organizationId, archivedAt: null },
    select: { id: true, stationCode: true, displayName: true, consoleFamily: true, maxPlayers: true, assetId: true },
  });
  if (!station) throw new EnterpriseDomainError("GAMING_PRICING_STATION_NOT_FOUND", 404);
  return station;
}

async function assertPricingCurrency(tx: Tx, organizationId: string, currency: string) {
  try {
    await assertEnterpriseCurrencyActiveTx(tx, organizationId, normalizeCurrency(currency));
  } catch (error) {
    if (error instanceof EnterpriseAccountingError) throw new EnterpriseDomainError("GAMING_PRICING_CURRENCY_INVALID", 409);
    throw error;
  }
}

function validateRuleState(input: {
  pricingMode: string;
  amount: Prisma.Decimal.Value;
  durationMinutes: number | null;
  billingIncrementMinutes: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
  dayOfWeekMask: number | null;
  startMinuteOfDay: number | null;
  endMinuteOfDay: number | null;
  extension: PricingRuleExtension;
}) {
  if (!(GAMING_PRICING_MODES as readonly string[]).includes(input.pricingMode)) throw new EnterpriseDomainError("GAMING_PRICING_RULE_INVALID", 400);
  if (decimal(input.amount).lt(0)) throw new EnterpriseDomainError("GAMING_PRICING_RULE_INVALID", 400);
  if ((input.pricingMode === "FIXED_DURATION" || input.pricingMode === "PACKAGE") && !input.durationMinutes) throw new EnterpriseDomainError("GAMING_PRICING_RULE_INVALID", 400);
  if (input.durationMinutes !== null && (input.durationMinutes < 1 || input.durationMinutes > 1440)) throw new EnterpriseDomainError("GAMING_PRICING_RULE_INVALID", 400);
  if (input.billingIncrementMinutes !== null && (input.billingIncrementMinutes < 1 || input.billingIncrementMinutes > 1440)) throw new EnterpriseDomainError("GAMING_PRICING_RULE_INVALID", 400);
  if ((input.startMinuteOfDay === null) !== (input.endMinuteOfDay === null)) throw new EnterpriseDomainError("GAMING_PRICING_RULE_INVALID", 400);
  if (input.dayOfWeekMask !== null && (input.dayOfWeekMask < 1 || input.dayOfWeekMask > 127)) throw new EnterpriseDomainError("GAMING_PRICING_RULE_INVALID", 400);
  if (input.validFrom && input.validUntil && input.validUntil <= input.validFrom) throw new EnterpriseDomainError("GAMING_PRICING_RULE_INVALID", 400);
  if (input.extension.minPlayers !== null && input.extension.maxPlayers !== null && input.extension.minPlayers > input.extension.maxPlayers) throw new EnterpriseDomainError("GAMING_PRICING_RULE_INVALID", 400);
}

function resolvedExtension(input: {
  consoleFamily?: string | null;
  minPlayers?: number | null;
  maxPlayers?: number | null;
  label?: string | null;
}, existing?: PricingRuleExtension): PricingRuleExtension {
  return {
    consoleFamily: input.consoleFamily === undefined ? existing?.consoleFamily || null : normalizeOptionalText(input.consoleFamily),
    minPlayers: input.minPlayers === undefined ? existing?.minPlayers ?? null : input.minPlayers ?? null,
    maxPlayers: input.maxPlayers === undefined ? existing?.maxPlayers ?? null : input.maxPlayers ?? null,
    label: input.label === undefined ? existing?.label || null : normalizeOptionalText(input.label),
  };
}

function ruleResult<T extends { ruleJson: Prisma.JsonValue | null }>(rule: T) {
  return { ...rule, targeting: ruleExtension(rule.ruleJson) };
}

export async function listGamingPricingRules({
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
  const safeStatus = status && (GAMING_PRICING_RULE_STATUSES as readonly string[]).includes(status) ? status : "";
  const serviceMatches = query
    ? await prisma.enterpriseCatalogItem.findMany({
      where: { organizationId, archivedAt: null, itemType: "SERVICE", OR: [{ name: { contains: query, mode: "insensitive" } }, { code: { contains: query, mode: "insensitive" } }] },
      select: { id: true },
      take: 200,
    })
    : [];
  const serviceIds = serviceMatches.map((item) => item.id);
  const where: Prisma.EnterpriseGamingPricingRuleWhereInput = {
    organizationId,
    archivedAt: null,
    ...(safeStatus ? { status: safeStatus } : {}),
    ...(query ? {
      OR: [
        { code: { contains: query, mode: "insensitive" } },
        { pricingMode: { contains: query, mode: "insensitive" } },
        ...(serviceIds.length ? [{ serviceCatalogItemId: { in: serviceIds } } as Prisma.EnterpriseGamingPricingRuleWhereInput] : []),
      ],
    } : {}),
  };

  const [items, total, grouped, currencies] = await Promise.all([
    prisma.enterpriseGamingPricingRule.findMany({
      where,
      include: { station: { select: { id: true, stationCode: true, displayName: true, consoleFamily: true, maxPlayers: true } } },
      orderBy: [{ priority: "asc" }, { code: "asc" }],
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    }),
    prisma.enterpriseGamingPricingRule.count({ where }),
    prisma.enterpriseGamingPricingRule.groupBy({
      by: ["status"],
      where: { organizationId, archivedAt: null },
      _count: { _all: true },
    }),
    listEnterpriseCurrencies(organizationId),
  ]);

  const catalogIds = [...new Set(items.map((item) => item.serviceCatalogItemId))];
  const catalogItems = catalogIds.length
    ? await prisma.enterpriseCatalogItem.findMany({
      where: { organizationId, id: { in: catalogIds } },
      select: { id: true, code: true, name: true, itemType: true, status: true, currency: true, indicativeSalePrice: true },
    })
    : [];
  const catalogMap = new Map(catalogItems.map((item) => [item.id, item]));
  const metrics = Object.fromEntries(grouped.map((row) => [row.status, row._count._all])) as Record<string, number>;

  return {
    items: items.map((item) => ({ ...ruleResult(item), catalogService: catalogMap.get(item.serviceCatalogItemId) || null })),
    currencies: currencies.filter((currency) => currency.isActive),
    pagination: { page: safePage, pageSize: safePageSize, total, pageCount: Math.max(1, Math.ceil(total / safePageSize)) },
    metrics: {
      total: Object.values(metrics).reduce((sum, value) => sum + value, 0),
      active: metrics.ACTIVE || 0,
      draft: metrics.DRAFT || 0,
      inactive: metrics.INACTIVE || 0,
    },
  };
}

export async function createGamingPricingRule(organizationId: string, actorUserId: string, input: CreateInput) {
  try {
    const id = await prisma.$transaction(async (tx) => {
      await assertCatalogService(tx, organizationId, input.serviceCatalogItemId);
      await assertPricingStation(tx, organizationId, input.stationId);
      await assertPricingCurrency(tx, organizationId, input.currency);
      const extension = resolvedExtension(input);
      const durationMinutes = input.durationMinutes ?? null;
      const increment = input.billingIncrementMinutes ?? null;
      validateRuleState({
        pricingMode: input.pricingMode,
        amount: input.amount,
        durationMinutes,
        billingIncrementMinutes: increment,
        validFrom: input.validFrom ?? null,
        validUntil: input.validUntil ?? null,
        dayOfWeekMask: input.dayOfWeekMask ?? null,
        startMinuteOfDay: input.startMinuteOfDay ?? null,
        endMinuteOfDay: input.endMinuteOfDay ?? null,
        extension,
      });
      const created = await tx.enterpriseGamingPricingRule.create({
        data: {
          organizationId,
          code: input.code.trim().toUpperCase(),
          serviceCatalogItemId: input.serviceCatalogItemId,
          stationId: normalizeOptionalText(input.stationId),
          pricingMode: input.pricingMode,
          amount: money(input.amount),
          currency: normalizeCurrency(input.currency),
          durationMinutes,
          billingIncrementMinutes: increment,
          validFrom: input.validFrom ?? null,
          validUntil: input.validUntil ?? null,
          dayOfWeekMask: input.dayOfWeekMask ?? null,
          startMinuteOfDay: input.startMinuteOfDay ?? null,
          endMinuteOfDay: input.endMinuteOfDay ?? null,
          priority: input.priority,
          status: input.status,
          ruleJson: extensionJson(extension),
          createdByUserId: actorUserId,
        },
        select: { id: true },
      });
      return created.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return loadGamingPricingRule(organizationId, id);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new EnterpriseDomainError("GAMING_PRICING_CODE_DUPLICATE", 409);
    throw error;
  }
}

async function loadGamingPricingRule(organizationId: string, ruleId: string, includeArchived = false) {
  const rule = await prisma.enterpriseGamingPricingRule.findFirst({
    where: { id: ruleId, organizationId },
    include: { station: { select: { id: true, stationCode: true, displayName: true, consoleFamily: true, maxPlayers: true } } },
  });
  if (!rule || (!includeArchived && rule.archivedAt)) throw new EnterpriseDomainError("GAMING_PRICING_RULE_NOT_FOUND", 404);
  const catalogService = await prisma.enterpriseCatalogItem.findFirst({
    where: { id: rule.serviceCatalogItemId, organizationId },
    select: { id: true, code: true, name: true, itemType: true, status: true, currency: true, indicativeSalePrice: true },
  });
  return { ...ruleResult(rule), catalogService };
}

export async function updateGamingPricingRule(organizationId: string, ruleId: string, actorUserId: string, input: UpdateInput) {
  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.enterpriseGamingPricingRule.findFirst({ where: { id: ruleId, organizationId } });
      if (!current || current.archivedAt) throw new EnterpriseDomainError("GAMING_PRICING_RULE_NOT_FOUND", 404);
      if (current.revision !== input.revision) throw new EnterpriseDomainConflictError();

      if (input.action === "ARCHIVE") {
        const archived = await tx.enterpriseGamingPricingRule.updateMany({
          where: { id: ruleId, organizationId, archivedAt: null, revision: input.revision },
          data: { status: "INACTIVE", archivedAt: new Date(), updatedByUserId: actorUserId, revision: { increment: 1 } },
        });
        if (archived.count !== 1) throw new EnterpriseDomainConflictError();
        return;
      }

      if (input.action === "ACTIVATE" || input.action === "DEACTIVATE") {
        const service = await assertCatalogService(tx, organizationId, current.serviceCatalogItemId);
        void service;
        await assertPricingStation(tx, organizationId, current.stationId);
        await assertPricingCurrency(tx, organizationId, current.currency);
        const extension = ruleExtension(current.ruleJson);
        validateRuleState({
          pricingMode: current.pricingMode,
          amount: current.amount,
          durationMinutes: current.durationMinutes,
          billingIncrementMinutes: current.billingIncrementMinutes,
          validFrom: current.validFrom,
          validUntil: current.validUntil,
          dayOfWeekMask: current.dayOfWeekMask,
          startMinuteOfDay: current.startMinuteOfDay,
          endMinuteOfDay: current.endMinuteOfDay,
          extension,
        });
        const changed = await tx.enterpriseGamingPricingRule.updateMany({
          where: { id: ruleId, organizationId, archivedAt: null, revision: input.revision },
          data: { status: input.action === "ACTIVATE" ? "ACTIVE" : "INACTIVE", updatedByUserId: actorUserId, revision: { increment: 1 } },
        });
        if (changed.count !== 1) throw new EnterpriseDomainConflictError();
        return;
      }

      const existingExtension = ruleExtension(current.ruleJson);
      const extension = resolvedExtension(input, existingExtension);
      const serviceCatalogItemId = input.serviceCatalogItemId ?? current.serviceCatalogItemId;
      const stationId = input.stationId === undefined ? current.stationId : normalizeOptionalText(input.stationId);
      const pricingMode = input.pricingMode ?? current.pricingMode;
      const amount = input.amount ?? Number(current.amount.toString());
      const currency = input.currency ?? current.currency;
      const durationMinutes = input.durationMinutes === undefined ? current.durationMinutes : input.durationMinutes ?? null;
      const billingIncrementMinutes = input.billingIncrementMinutes === undefined ? current.billingIncrementMinutes : input.billingIncrementMinutes ?? null;
      const validFrom = input.validFrom === undefined ? current.validFrom : input.validFrom ?? null;
      const validUntil = input.validUntil === undefined ? current.validUntil : input.validUntil ?? null;
      const dayOfWeekMask = input.dayOfWeekMask === undefined ? current.dayOfWeekMask : input.dayOfWeekMask ?? null;
      const startMinuteOfDay = input.startMinuteOfDay === undefined ? current.startMinuteOfDay : input.startMinuteOfDay ?? null;
      const endMinuteOfDay = input.endMinuteOfDay === undefined ? current.endMinuteOfDay : input.endMinuteOfDay ?? null;

      await assertCatalogService(tx, organizationId, serviceCatalogItemId);
      await assertPricingStation(tx, organizationId, stationId);
      await assertPricingCurrency(tx, organizationId, currency);
      validateRuleState({ pricingMode, amount, durationMinutes, billingIncrementMinutes, validFrom, validUntil, dayOfWeekMask, startMinuteOfDay, endMinuteOfDay, extension });

      const changed = await tx.enterpriseGamingPricingRule.updateMany({
        where: { id: ruleId, organizationId, archivedAt: null, revision: input.revision },
        data: {
          ...(input.code !== undefined ? { code: input.code.trim().toUpperCase() } : {}),
          serviceCatalogItemId,
          stationId,
          pricingMode,
          amount: money(amount),
          currency: normalizeCurrency(currency),
          durationMinutes,
          billingIncrementMinutes,
          validFrom,
          validUntil,
          dayOfWeekMask,
          startMinuteOfDay,
          endMinuteOfDay,
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ruleJson: extensionJson(extension),
          updatedByUserId: actorUserId,
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new EnterpriseDomainConflictError();
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return loadGamingPricingRule(organizationId, ruleId, input.action === "ARCHIVE");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new EnterpriseDomainError("GAMING_PRICING_CODE_DUPLICATE", 409);
    throw error;
  }
}

export async function resolveGamingPricingQuoteTx({
  tx,
  organizationId,
  serviceCatalogItemId,
  stationId,
  durationMinutes,
  playerCount,
  startAt,
  overrideAmount,
  overrideReason,
  overrideByUserId,
}: {
  tx: Tx;
  organizationId: string;
  serviceCatalogItemId: string;
  stationId: string;
  durationMinutes: number;
  playerCount: number;
  startAt: Date;
  overrideAmount?: number | null;
  overrideReason?: string | null;
  overrideByUserId?: string | null;
}) {
  const service = await assertCatalogService(tx, organizationId, serviceCatalogItemId);
  const station = await assertPricingStation(tx, organizationId, stationId);
  if (!station) throw new EnterpriseDomainError("GAMING_PRICING_STATION_NOT_FOUND", 404);
  if (playerCount > station.maxPlayers) throw new EnterpriseDomainError("GAMING_PRICING_NO_MATCH", 409);

  const asset = await tx.enterpriseAsset.findFirst({
    where: { id: station.assetId, organizationId, archivedAt: null },
    select: { site: { select: { timezone: true } } },
  });
  const timezone = safeTimezone(asset?.site?.timezone);
  const local = localPricingParts(startAt, timezone);

  const candidates = await tx.enterpriseGamingPricingRule.findMany({
    where: {
      organizationId,
      serviceCatalogItemId,
      status: "ACTIVE",
      archivedAt: null,
      AND: [
        { OR: [{ stationId: null }, { stationId }] },
        { OR: [{ validFrom: null }, { validFrom: { lte: startAt } }] },
        { OR: [{ validUntil: null }, { validUntil: { gt: startAt } }] },
      ],
    },
    orderBy: [{ priority: "asc" }, { code: "asc" }],
    take: 500,
  });

  const matching = candidates.filter((rule) => {
    const extension = ruleExtension(rule.ruleJson);
    if (extension.consoleFamily && extension.consoleFamily.toLocaleLowerCase() !== (station.consoleFamily || "").toLocaleLowerCase()) return false;
    if (extension.minPlayers !== null && playerCount < extension.minPlayers) return false;
    if (extension.maxPlayers !== null && playerCount > extension.maxPlayers) return false;
    if (rule.dayOfWeekMask !== null && (rule.dayOfWeekMask & local.weekdayBit) === 0) return false;
    if (!matchesMinuteRange(local.minuteOfDay, rule.startMinuteOfDay, rule.endMinuteOfDay)) return false;
    if ((rule.pricingMode === "FIXED_DURATION" || rule.pricingMode === "PACKAGE") && rule.durationMinutes !== durationMinutes) return false;
    return true;
  });

  matching.sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    const specificityDelta = specificity(right) - specificity(left);
    if (specificityDelta !== 0) return specificityDelta;
    const codeDelta = left.code.localeCompare(right.code);
    return codeDelta || left.id.localeCompare(right.id);
  });

  const rule = matching[0];
  if (!rule) throw new EnterpriseDomainError("GAMING_PRICING_NO_MATCH", 409);
  await assertPricingCurrency(tx, organizationId, rule.currency);

  const mode = rule.pricingMode as GamingPricingMode;
  const increment = billingIncrement(mode, rule.billingIncrementMinutes);
  const baseQuote = quoteForDuration(mode, rule.amount, durationMinutes, increment);
  const hasOverride = overrideAmount !== undefined && overrideAmount !== null;
  if (hasOverride && !overrideReason?.trim()) throw new EnterpriseDomainError("GAMING_PRICING_OVERRIDE_REASON_REQUIRED", 400);
  const quotedAmount = hasOverride ? money(overrideAmount) : baseQuote;

  const snapshot: GamingPricingSnapshot = {
    contractVersion: 1,
    authority: "SERVER",
    pricingRuleId: rule.id,
    pricingRuleCode: rule.code,
    serviceCatalogItemId: service.id,
    serviceCode: service.code,
    serviceName: service.name,
    stationId: station.id,
    stationCode: station.stationCode,
    consoleFamily: station.consoleFamily,
    playerCount,
    pricingMode: mode,
    currency: normalizeCurrency(rule.currency),
    unitAmount: money(rule.amount).toFixed(2),
    quotedAmount: quotedAmount.toFixed(2),
    requestedDurationMinutes: durationMinutes,
    fixedDurationMinutes: rule.durationMinutes,
    billingIncrementMinutes: increment,
    startAt: startAt.toISOString(),
    timezone,
    localWeekday: local.weekday,
    localMinuteOfDay: local.minuteOfDay,
    rulePriority: rule.priority,
    overrideAmount: hasOverride ? quotedAmount.toFixed(2) : null,
    overrideReason: hasOverride ? overrideReason!.trim() : null,
    overrideByUserId: hasOverride ? overrideByUserId || null : null,
  };

  return {
    rule,
    service,
    station,
    currency: snapshot.currency,
    quotedAmount,
    snapshot,
  };
}

export function finalAmountFromGamingPricingSnapshot(snapshotValue: Prisma.JsonValue | null | undefined, billableSeconds: number) {
  if (!snapshotValue || typeof snapshotValue !== "object" || Array.isArray(snapshotValue)) return null;
  const snapshot = snapshotValue as unknown as Partial<GamingPricingSnapshot>;
  if (snapshot.contractVersion !== 1 || snapshot.authority !== "SERVER" || !snapshot.pricingMode || !snapshot.unitAmount || !snapshot.currency) return null;
  if (snapshot.overrideAmount) return { amount: money(snapshot.overrideAmount), currency: snapshot.currency };
  const mode = snapshot.pricingMode;
  if (mode === "FIXED_DURATION" || mode === "PACKAGE") {
    if (!snapshot.quotedAmount) return null;
    return { amount: money(snapshot.quotedAmount), currency: snapshot.currency };
  }
  const billableMinutes = Math.max(0, billableSeconds / 60);
  if (billableMinutes === 0) return { amount: money(0), currency: snapshot.currency };
  const increment = Math.max(1, Number(snapshot.billingIncrementMinutes || (mode === "PER_HOUR" ? 60 : 1)));
  const roundedMinutes = Math.max(increment, Math.ceil(billableMinutes / increment) * increment);
  const unitAmount = decimal(snapshot.unitAmount);
  const amount = mode === "PER_MINUTE" ? unitAmount.mul(roundedMinutes) : unitAmount.mul(roundedMinutes).div(60);
  return { amount: money(amount), currency: snapshot.currency };
}

export async function simulateGamingPricing(organizationId: string, actorUserId: string, input: SimulationInput, canOverride: boolean) {
  if (input.priceOverrideAmount !== undefined && input.priceOverrideAmount !== null && !canOverride) {
    throw new EnterpriseDomainError("GAMING_PRICING_OVERRIDE_FORBIDDEN", 403);
  }
  const startAt = input.startAt || new Date();
  return prisma.$transaction(async (tx) => {
    const resolved = await resolveGamingPricingQuoteTx({
      tx,
      organizationId,
      serviceCatalogItemId: input.serviceCatalogItemId,
      stationId: input.stationId,
      durationMinutes: input.durationMinutes,
      playerCount: input.playerCount,
      startAt,
      overrideAmount: input.priceOverrideAmount,
      overrideReason: input.priceOverrideReason,
      overrideByUserId: input.priceOverrideAmount !== undefined && input.priceOverrideAmount !== null ? actorUserId : null,
    });
    return {
      pricingRuleId: resolved.rule.id,
      pricingRuleCode: resolved.rule.code,
      service: { id: resolved.service.id, code: resolved.service.code, name: resolved.service.name },
      station: { id: resolved.station.id, stationCode: resolved.station.stationCode, displayName: resolved.station.displayName, consoleFamily: resolved.station.consoleFamily },
      currency: resolved.currency,
      quotedAmount: resolved.quotedAmount.toFixed(2),
      snapshot: resolved.snapshot,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
