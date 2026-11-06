import type { Prisma } from "@prisma/client";

// Explicit mapping: unknown payment methods cannot silently fall back to BANK.
export function subscriptionSettlementAccountType(method: string): "BANK" | "CASH" | "MOBILE_MONEY" {
  switch (method) {
    case "BANK_TRANSFER":
    case "CARD":
    case "CHECK": return "BANK";
    case "CASH": return "CASH";
    case "MOBILE_MONEY": return "MOBILE_MONEY";
    default: throw new Error("MANUAL_SETTLEMENT_METHOD_UNSUPPORTED");
  }
}

type Account = { id: string; name: string; status: string; accountType: string; currency: string | null; reconciliationIssue: string | null };

export function isConfiguredSubscriptionSettlementAccount(account: Account): boolean {
  // Accounts created automatically by legacy flows do not attest custody of real funds.
  return account.status === "ACTIVE" && Boolean(account.currency) && !account.reconciliationIssue
    && ["BANK", "CASH", "MOBILE_MONEY"].includes(account.accountType)
    && !account.name.startsWith("Encaissements abonnements ·")
    && !["acct-banque", "acct-caisse-principale"].includes(account.id);
}

export async function assertSubscriptionSettlementAccount(
  tx: Prisma.TransactionClient,
  input: { accountId: string | undefined; paymentMethod: string; currency: string },
) {
  if (!input.accountId) throw new Error("MANUAL_SETTLEMENT_ACCOUNT_REQUIRED");
  const expectedType = subscriptionSettlementAccountType(input.paymentMethod);
  await tx.$queryRaw`SELECT "id" FROM "FinancialAccount" WHERE "id" = ${input.accountId} FOR UPDATE`;
  const account = await tx.financialAccount.findUnique({ where: { id: input.accountId } });
  if (!account || !isConfiguredSubscriptionSettlementAccount(account)) throw new Error("MANUAL_SETTLEMENT_ACCOUNT_UNVERIFIED");
  if (account.currency !== input.currency || account.accountType !== expectedType) throw new Error("MANUAL_SETTLEMENT_ACCOUNT_MISMATCH");
  return account;
}
