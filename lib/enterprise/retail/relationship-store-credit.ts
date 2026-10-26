import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";

type RetailTx = Prisma.TransactionClient;
const money = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);

export function relationalStoreCreditScope(customerBusinessPartyId: string, currencyCode: string) {
  return `RELATIONSHIP_STORE_CREDIT:v1:${customerBusinessPartyId}:${currencyCode.toUpperCase()}`;
}

export async function ensureRelationalStoreCreditAccountTx(args: {
  tx: RetailTx;
  organizationId: string;
  customerBusinessPartyId: string;
  currencyCode: string;
  actorUserId: string;
}) {
  const scope = relationalStoreCreditScope(args.customerBusinessPartyId, args.currencyCode);
  // The bearer hash is random and inaccessible to the POS. The unique scope
  // is a separate lookup identity, never an authorization token.
  const secret = randomBytes(32).toString("hex");
  const account = await args.tx.enterpriseRetailStoredValueAccount.upsert({
    where: { organizationId_benefitScopeKey: { organizationId: args.organizationId, benefitScopeKey: scope } },
    update: {},
    create: {
      organizationId: args.organizationId,
      benefitScopeKey: scope,
      accountType: "STORE_CREDIT",
      lookupHash: createHash("sha256").update(secret).digest("hex"),
      displayCode: "AVOIR-" + randomBytes(5).toString("hex").toUpperCase(),
      customerBusinessPartyId: args.customerBusinessPartyId,
      currencyCode: args.currencyCode,
      initialValue: 0,
      balance: 0,
      createdByUserId: args.actorUserId,
    },
  });
  if (account.archivedAt || account.accountType !== "STORE_CREDIT" || account.customerBusinessPartyId !== args.customerBusinessPartyId || account.currencyCode !== args.currencyCode) {
    throw new EnterpriseRetailError("RETAIL_STORED_VALUE_INACTIVE", 409);
  }
  return account;
}

export async function changeRelationalStoreCreditTx(args: {
  tx: RetailTx;
  organizationId: string;
  accountId: string;
  customerBusinessPartyId: string;
  currencyCode: string;
  actorUserId: string;
  amount: Prisma.Decimal;
  entryType: "EARN" | "REDEEM" | "REFUND" | "REVERSAL";
  idempotencyKey: string;
  saleId?: string;
  returnId?: string;
  reason: string;
}) {
  const existing = await args.tx.enterpriseRetailStoredValueEntry.findFirst({
    where: { organizationId: args.organizationId, idempotencyKey: args.idempotencyKey },
  });
  if (existing) {
    if (existing.accountId !== args.accountId || existing.entryType !== args.entryType ||
      !existing.amount.equals(args.amount) || existing.saleId !== (args.saleId || null) || existing.returnId !== (args.returnId || null)) {
      throw new EnterpriseRetailError("RETAIL_STORED_VALUE_IDEMPOTENCY_CONFLICT", 409);
    }
    return existing;
  }
  await args.tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailStoredValueAccount" WHERE id = ${args.accountId} AND "organizationId" = ${args.organizationId} FOR UPDATE`);
  const account = await args.tx.enterpriseRetailStoredValueAccount.findFirst({ where: { id: args.accountId, organizationId: args.organizationId } });
  if (!account || account.archivedAt || account.accountType !== "STORE_CREDIT" ||
    account.benefitScopeKey !== relationalStoreCreditScope(args.customerBusinessPartyId, args.currencyCode) ||
    account.customerBusinessPartyId !== args.customerBusinessPartyId || account.currencyCode !== args.currencyCode) {
    throw new EnterpriseRetailError("RETAIL_STORED_VALUE_CUSTOMER_MISMATCH", 409);
  }
  if (!["ACTIVE", "EXHAUSTED"].includes(account.status)) {
    throw new EnterpriseRetailError("RETAIL_STORED_VALUE_INACTIVE", 409, { status: account.status });
  }
  if (account.expiresAt && account.expiresAt <= new Date()) throw new EnterpriseRetailError("RETAIL_STORED_VALUE_EXPIRED", 409);
  if (!args.amount.isFinite() || args.amount.isZero() || !money(args.amount).eq(args.amount)) {
    throw new EnterpriseRetailError("RETAIL_STORED_VALUE_AMOUNT_INVALID", 409);
  }
  if (args.entryType === "REDEEM" && (!args.amount.isNegative() || !account.balance.gte(args.amount.abs()) || account.status !== "ACTIVE")) {
    throw new EnterpriseRetailError("RETAIL_STORED_VALUE_INSUFFICIENT", 409, { available: account.balance.toFixed(), requested: args.amount.abs().toFixed() });
  }
  if (args.entryType !== "REDEEM" && args.entryType !== "REVERSAL" && !args.amount.isPositive()) {
    throw new EnterpriseRetailError("RETAIL_STORED_VALUE_AMOUNT_INVALID", 409);
  }
  if (args.entryType === "REVERSAL" && !args.amount.isNegative()) throw new EnterpriseRetailError("RETAIL_STORED_VALUE_AMOUNT_INVALID", 409);
  const entry = await args.tx.enterpriseRetailStoredValueEntry.create({
    data: {
      organizationId: args.organizationId, accountId: account.id, entryType: args.entryType,
      amount: args.amount, saleId: args.saleId || null, returnId: args.returnId || null,
      reason: args.reason, idempotencyKey: args.idempotencyKey, createdByUserId: args.actorUserId,
    },
  });
  const next = money(account.balance.plus(args.amount));
  await args.tx.enterpriseRetailStoredValueAccount.update({
    where: { id: account.id },
    data: { balance: next, status: next.isZero() ? "EXHAUSTED" : "ACTIVE", revision: { increment: 1 } },
  });
  return entry;
}
