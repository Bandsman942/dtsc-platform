import type { Prisma } from "@prisma/client";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";

type EnterpriseBusinessContextDb = Pick<Prisma.TransactionClient, "organization" | "enterpriseFinanceConfiguration">;

export type EnterpriseBusinessContext = {
  timezone: string;
  functionalCurrencyCode: string | null;
};

function normalizeCurrencyCode(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() || "";
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

export function assertEnterpriseTimezone(timezone: string | null | undefined) {
  const normalized = timezone?.trim() || "";
  if (!normalized) throw new EnterpriseDomainError("ORGANIZATION_TIMEZONE_INVALID", 409);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format(new Date(0));
    return normalized;
  } catch {
    throw new EnterpriseDomainError("ORGANIZATION_TIMEZONE_INVALID", 409);
  }
}

export function formatEnterpriseBusinessDate(at: Date, timezone: string) {
  const safeTimezone = assertEnterpriseTimezone(timezone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimezone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  if (!year || !month || !day) throw new EnterpriseDomainError("ORGANIZATION_TIMEZONE_INVALID", 409);
  return `${year}-${month}-${day}`;
}

/**
 * UTC half-open windows for an organization's local calendar day and month.
 * Resolve both endpoints independently: a day spanning a DST transition
 * must not be assumed to last 86,400 seconds.
 */
export function enterpriseBusinessCalendarWindows(at: Date, timezone: string) {
  const safeTimezone = assertEnterpriseTimezone(timezone);
  const businessDate = formatEnterpriseBusinessDate(at, safeTimezone);
  const [year, month, day] = businessDate.split("-").map(Number);

  function utcForLocalMidnight(yearValue: number, monthValue: number, dayValue: number) {
    const desiredUtc = Date.UTC(yearValue, monthValue - 1, dayValue);
    let candidate = desiredUtc;
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: safeTimezone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const values = new Map(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
      const representedUtc = Date.UTC(
        Number(values.get("year")), Number(values.get("month")) - 1,
        Number(values.get("day")), Number(values.get("hour")),
        Number(values.get("minute")), Number(values.get("second")),
      );
      const correction = desiredUtc - representedUtc;
      candidate += correction;
      if (correction === 0) return new Date(candidate);
    }
    // Refuse to invent a midnight for a timezone with a skipped local date.
    throw new EnterpriseDomainError("ORGANIZATION_TIMEZONE_INVALID", 409);
  }

  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
  const nextMonth = new Date(Date.UTC(year, month, 1));
  return {
    businessDate,
    timezone: safeTimezone,
    day: {
      gte: utcForLocalMidnight(year, month, day),
      lt: utcForLocalMidnight(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate()),
    },
    month: {
      gte: utcForLocalMidnight(year, month, 1),
      lt: utcForLocalMidnight(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 1),
    },
  };
}

export async function getEnterpriseBusinessContext(
  db: EnterpriseBusinessContextDb,
  organizationId: string,
): Promise<EnterpriseBusinessContext> {
  const [organization, configuration] = await Promise.all([
    db.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
      select: { timezone: true },
    }),
    db.enterpriseFinanceConfiguration.findUnique({
      where: { organizationId },
      select: { functionalCurrencyCode: true },
    }),
  ]);
  if (!organization) throw new EnterpriseDomainError("ORGANIZATION_NOT_ACTIVE", 404);
  return {
    timezone: assertEnterpriseTimezone(organization.timezone),
    functionalCurrencyCode: normalizeCurrencyCode(configuration?.functionalCurrencyCode),
  };
}

export async function getEnterpriseBusinessContextForAuthorizedOrganization(
  db: Pick<Prisma.TransactionClient, "enterpriseFinanceConfiguration">,
  organizationId: string,
  timezone: string,
): Promise<EnterpriseBusinessContext> {
  const configuration = await db.enterpriseFinanceConfiguration.findUnique({
    where: { organizationId },
    select: { functionalCurrencyCode: true },
  });
  return {
    timezone: assertEnterpriseTimezone(timezone),
    functionalCurrencyCode: normalizeCurrencyCode(configuration?.functionalCurrencyCode),
  };
}

export async function resolveEnterpriseBusinessDate(
  db: EnterpriseBusinessContextDb,
  organizationId: string,
  at = new Date(),
) {
  const context = await getEnterpriseBusinessContext(db, organizationId);
  return formatEnterpriseBusinessDate(at, context.timezone);
}

export async function requireEnterpriseFunctionalCurrency(
  db: EnterpriseBusinessContextDb,
  organizationId: string,
) {
  const context = await getEnterpriseBusinessContext(db, organizationId);
  if (!context.functionalCurrencyCode) {
    throw new EnterpriseDomainError("ENTERPRISE_CURRENCY_CONFIGURATION_REQUIRED", 409);
  }
  return context.functionalCurrencyCode;
}
