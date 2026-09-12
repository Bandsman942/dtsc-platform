import type { Prisma } from "@prisma/client";
import { resolveSemanticPostingAccount } from "@/lib/enterprise/accounting/semantic-account-resolver";

export const C5_SEMANTIC_ACCOUNT_ALIASES = Object.freeze({
  ASSET_DISPOSAL_GAIN: "CASH_VARIANCE_INCOME",
  ASSET_DISPOSAL_LOSS: "CASH_VARIANCE_EXPENSE",
} as const);

export type C5SemanticAccountAlias = keyof typeof C5_SEMANTIC_ACCOUNT_ALIASES;

/**
 * C5 keeps the immutable OHADA_SYSCOHADA@0.1.0 baseline untouched. Asset-disposal
 * gains/losses reuse the already provisioned miscellaneous income/expense accounts
 * behind the canonical cash-variance mappings, while the business builder keeps an
 * explicit disposal semantic. No regulatory account number is hard-coded here.
 */
export async function resolveC5SemanticAliasAccount(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    alias: C5SemanticAccountAlias;
    accountingDate: Date;
  },
) {
  return resolveSemanticPostingAccount(tx, {
    organizationId: input.organizationId,
    mappingKey: C5_SEMANTIC_ACCOUNT_ALIASES[input.alias],
    accountingDate: input.accountingDate,
  });
}
