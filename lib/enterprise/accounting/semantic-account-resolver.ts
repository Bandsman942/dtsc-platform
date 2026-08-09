import type { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { getSemanticAccountDefinition } from "@/lib/enterprise/accounting/semantic-account-registry";

export async function resolveSemanticPostingAccount(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    mappingKey: string;
    accountingDate: Date;
  },
) {
  if (input.mappingKey.startsWith("ACCOUNT_ID:")) {
    const accountId = input.mappingKey.slice("ACCOUNT_ID:".length);
    const direct = await tx.enterpriseLedgerAccount.findFirst({
      where: { id: accountId, organizationId: input.organizationId, isActive: true, archivedAt: null },
    });
    if (!direct) throw new EnterpriseAccountingError("POSTING_DIRECT_ACCOUNT_INVALID", 409, { accountId });
    return direct;
  }

  const definition = getSemanticAccountDefinition(input.mappingKey);
  if (!definition || definition.deprecated) {
    throw new EnterpriseAccountingError("POSTING_SEMANTIC_KEY_UNKNOWN", 409, { mappingKey: input.mappingKey });
  }

  const mapping = await tx.enterpriseAccountMapping.findFirst({
    where: {
      organizationId: input.organizationId,
      mappingKey: input.mappingKey,
      isActive: true,
      OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: input.accountingDate } }],
      AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.accountingDate } }] }],
    },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  if (!mapping) {
    throw new EnterpriseAccountingError("POSTING_ACCOUNT_MAPPING_REQUIRED", 409, {
      mappingKey: input.mappingKey,
      accountingDate: input.accountingDate.toISOString(),
    });
  }

  const account = await tx.enterpriseLedgerAccount.findFirst({
    where: {
      id: mapping.ledgerAccountId,
      organizationId: input.organizationId,
      isActive: true,
      archivedAt: null,
    },
  });
  if (!account) throw new EnterpriseAccountingError("POSTING_ACCOUNT_INACTIVE", 409, { mappingKey: input.mappingKey });
  if (!definition.expectedAccountTypes.includes(account.accountType)) {
    throw new EnterpriseAccountingError("POSTING_ACCOUNT_TYPE_INCOMPATIBLE", 409, {
      mappingKey: input.mappingKey,
      accountType: account.accountType,
      expectedAccountTypes: definition.expectedAccountTypes,
    });
  }
  if (
    definition.expectedAccountSubtypes?.length &&
    account.accountSubtype &&
    !definition.expectedAccountSubtypes.includes(account.accountSubtype)
  ) {
    throw new EnterpriseAccountingError("POSTING_ACCOUNT_SUBTYPE_INCOMPATIBLE", 409, {
      mappingKey: input.mappingKey,
      accountSubtype: account.accountSubtype,
      expectedAccountSubtypes: definition.expectedAccountSubtypes,
    });
  }
  return account;
}
