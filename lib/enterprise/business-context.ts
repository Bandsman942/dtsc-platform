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
