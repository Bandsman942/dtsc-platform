import fs from "node:fs";

function replaceExact(file, before, after) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes(before)) {
    throw new Error(`Expected block not found in ${file}: ${before.slice(0, 120)}`);
  }
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) throw new Error(`Expected exactly one match in ${file}, found ${occurrences}`);
  fs.writeFileSync(file, source.replace(before, after));
}

replaceExact(
  "lib/enterprise/retail/service.ts",
  'import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";\n',
  'import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";\nimport { resolveMobileMoneyFloatAccountTx } from "@/lib/enterprise/retail/mobile-money-multicurrency-service";\n',
);
replaceExact(
  "lib/enterprise/retail/service.ts",
  '    const floatAccountId = input.floatAccountId || provider.mobileMoneyFloatAccountId;\n    if (!floatAccountId) throw new EnterpriseRetailError("RETAIL_FLOAT_ACCOUNT_REQUIRED", 409, { providerCode: input.providerCode });\n    const cashAccount = await assertFinancialAccount(tx, organizationId, input.cashAccountId, input.currencyCode, ["CASH"]);\n    const floatAccount = await assertFinancialAccount(tx, organizationId, floatAccountId, input.currencyCode, ["MOBILE_MONEY"]);\n',
  '    const cashAccount = await assertFinancialAccount(tx, organizationId, input.cashAccountId, input.currencyCode, ["CASH"]);\n    const resolvedFloatAccount = await resolveMobileMoneyFloatAccountTx(tx, organizationId, provider, input.currencyCode);\n    const floatAccount = resolvedFloatAccount.account;\n',
);

replaceExact(
  "lib/enterprise/retail/operator-orchestration.ts",
  'import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";\n',
  'import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";\nimport { finalizeMobileMoneyAccounting } from "@/lib/enterprise/retail/mobile-money-accounting";\n',
);
replaceExact(
  "lib/enterprise/retail/operator-orchestration.ts",
  '  if (operation.sourceEntityType === ACTUAL_MOBILE_MONEY) {\n    const transaction = await prisma.enterpriseMobileMoneyTransaction.findFirst({ where: { id: operation.sourceEntityId, organizationId } });\n    return transaction ? { kind: "MOBILE_MONEY" as const, transaction, idempotent: true } : null;\n  }\n',
  '  if (operation.sourceEntityType === ACTUAL_MOBILE_MONEY) {\n    const transaction = await prisma.enterpriseMobileMoneyTransaction.findFirst({ where: { id: operation.sourceEntityId, organizationId } });\n    if (!transaction) return null;\n    await finalizeMobileMoneyAccounting(organizationId, operation.createdByUserId, transaction.id);\n    return { kind: "MOBILE_MONEY" as const, transaction, idempotent: true };\n  }\n',
);
replaceExact(
  "lib/enterprise/retail/operator-orchestration.ts",
  '    const result = await createMobileMoneyTransaction(organizationId, operation.createdByUserId, parsed.data);\n    await prisma.enterpriseRetailProviderOperation.update({\n',
  '    const result = await createMobileMoneyTransaction(organizationId, operation.createdByUserId, parsed.data);\n    await finalizeMobileMoneyAccounting(organizationId, operation.createdByUserId, result.transaction.id);\n    await prisma.enterpriseRetailProviderOperation.update({\n',
);

replaceExact(
  "lib/enterprise/retail/http.ts",
  '  RETAIL_FLOAT_ACCOUNT_REQUIRED: "L’opérateur doit être lié à un vrai compte de float avant la première opération.",\n',
  '  RETAIL_FLOAT_ACCOUNT_REQUIRED: "L’opérateur doit être lié à un vrai compte de float avant la première opération.",\n  RETAIL_MOBILE_MONEY_CURRENCY_ACCOUNT_REQUIRED: "Configurez un wallet Mobile Money pour cet opérateur dans la devise de la caisse avant de continuer.",\n  RETAIL_MOBILE_MONEY_FX_PAIR_INVALID: "Choisissez deux devises différentes pour le transfert Mobile Money.",\n  RETAIL_MOBILE_MONEY_FX_MAPPING_REQUIRED: "Cet opérateur doit disposer de deux wallets Mobile Money configurés avant un transfert entre devises.",\n  RETAIL_MOBILE_MONEY_FX_AMOUNT_INVALID: "Le montant à convertir doit être strictement positif.",\n  RETAIL_MOBILE_MONEY_FX_TRANSFER_NOT_FOUND: "Le transfert Mobile Money demandé est introuvable.",\n  RETAIL_MOBILE_MONEY_FX_TRANSFER_CONFLICT: "Ce transfert Mobile Money a déjà changé d’état. Actualisez avant de réessayer.",\n',
);

replaceExact(
  "lib/enterprise/accounting/semantic-account-registry.ts",
  '{ key: "SERVICE_REVENUE", domain: "SALES", labelFr: "Chiffre d\'affaires - services", labelEn: "Service revenue", category: "REVENUE", expectedAccountTypes: ["REVENUE", "OTHER_INCOME"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },',
  '{ key: "SERVICE_REVENUE", domain: "SALES", labelFr: "Chiffre d\'affaires - services", labelEn: "Service revenue", category: "REVENUE", expectedAccountTypes: ["REVENUE", "OTHER_INCOME"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: ["RETAIL_MOBILE_MONEY_POSTED", "RETAIL_MOBILE_MONEY_REVERSED"] },',
);

replaceExact(
  "prisma/migrations/20260814101500_mobile_money_multicurrency_accounts/migration.sql",
  '  COALESCE(rc."createdByUserId", \'migration-307\'),\n',
  "  'migration-307',\n",
);
replaceExact(
  "prisma/migrations/20260814101500_mobile_money_multicurrency_accounts/migration.sql",
  'LEFT JOIN "EnterpriseRetailConfiguration" rc\n  ON rc."organizationId" = p."organizationId"\n',
  '',
);

console.log("Issue #307 guarded codemod applied successfully.");
