import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

export function financeReference(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

export function decimal(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export function money(value: Prisma.Decimal.Value, precision = 6): Prisma.Decimal {
  return decimal(value).toDecimalPlaces(precision, Prisma.Decimal.ROUND_HALF_UP);
}

export function sumDecimals(values: Prisma.Decimal.Value[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((total, value) => total.plus(value), new Prisma.Decimal(0));
}

export function assertPositiveAmount(value: Prisma.Decimal.Value, code = "FINANCE_AMOUNT_MUST_BE_POSITIVE") {
  const amount = decimal(value);
  if (!amount.isPositive()) throw new EnterpriseAccountingError(code, 400);
  return amount;
}

export function idempotencyKey(input: {
  organizationId: string;
  sourceEntityType: string;
  sourceEntityId: string;
  postingEvent: string;
  postingVersion: number;
}) {
  return [input.organizationId, input.sourceEntityType, input.sourceEntityId, input.postingEvent, input.postingVersion].join(":");
}

export async function assertActiveClientOrganization(tx: Prisma.TransactionClient, organizationId: string) {
  const organization = await tx.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    select: { id: true },
  });
  if (!organization) throw new EnterpriseAccountingError("FINANCE_ORGANIZATION_NOT_ACTIVE", 403);
}

export async function publishFinanceEvent(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    entityType: string;
    entityId: string;
    eventType: string;
    summary: string;
    actorUserId: string;
    fromStatus?: string;
    toStatus?: string;
    metadataJson?: Prisma.InputJsonValue;
  },
) {
  await tx.enterpriseOperationalEvent.create({ data: input });
}

export function serializeFinanceValue(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) return value.toFixed();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeFinanceValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, serializeFinanceValue(nested)]));
  }
  return value;
}
