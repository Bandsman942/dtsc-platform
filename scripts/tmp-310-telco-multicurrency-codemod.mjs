import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const p = (file) => path.join(root, file);
const read = (file) => fs.readFileSync(p(file), "utf8");
const write = (file, content) => { fs.mkdirSync(path.dirname(p(file)), { recursive: true }); fs.writeFileSync(p(file), content); };
const materialize = (value) => value.replaceAll("§", "`").replaceAll("¤{", "${");

function replaceOnce(file, before, after) {
  const source = read(file);
  if (!source.includes(before)) throw new Error(`Missing replacement marker in ${file}: ${before.slice(0, 100)}`);
  write(file, source.replace(before, after));
}

function replaceBetween(file, start, end, replacement) {
  const source = read(file);
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`Missing range markers in ${file}: ${start} / ${end}`);
  write(file, source.slice(0, a) + replacement + source.slice(b));
}

function ensure(source, marker, label) {
  if (!source.includes(marker)) throw new Error(`Missing ${label}: ${marker}`);
}

write("lib/enterprise/retail/operator-currency-policy.ts", materialize(String.raw`const DRC_COUNTRY_MARKERS = new Set([
  "CD",
  "COD",
  "RDC",
  "DRC",
  "CONGO RDC",
  "CONGO-KINSHASA",
  "DEMOCRATIC REPUBLIC OF THE CONGO",
]);

function normalizeCountry(value: string | null | undefined) {
  return (value || "").trim().toUpperCase().replace(/[^A-Z -]/g, "");
}

export function requiredRetailOperatorCurrencies(country: string | null | undefined) {
  return DRC_COUNTRY_MARKERS.has(normalizeCountry(country)) ? ["CDF", "USD"] : [];
}

export function isRetailOperatorCurrencyReady(country: string | null | undefined, currencies: Iterable<string>) {
  const mapped = new Set(Array.from(currencies, (currency) => currency.trim().toUpperCase()));
  const required = requiredRetailOperatorCurrencies(country);
  return required.length ? required.every((currency) => mapped.has(currency)) : mapped.size >= 2;
}
`));

write("lib/enterprise/retail/telco-multicurrency-schemas.ts", String.raw`import { z } from "zod";

const currency = z.string().trim().length(3).transform((value) => value.toUpperCase());
const id = z.string().trim().min(1).max(240);

export const telcoProviderAccountUpsertSchema = z.object({
  providerCode: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
  currencyCode: currency,
  financialAccountId: id,
});
`);

write("lib/enterprise/retail/telco-multicurrency-service.ts", materialize(String.raw`import { Prisma } from "@prisma/client";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { isRetailOperatorCurrencyReady, requiredRetailOperatorCurrencies } from "@/lib/enterprise/retail/operator-currency-policy";
import { prisma } from "@/lib/prisma";

export const TELCO_FLOAT_ACCOUNT_USE = "TELCO_FLOAT";

async function assertTelcoProviderTx(tx: Prisma.TransactionClient, organizationId: string, providerCode: string) {
  const provider = await tx.enterpriseRetailProvider.findFirst({
    where: { organizationId, providerCode, providerType: { in: ["TELCO", "BOTH"] }, isActive: true },
  });
  if (!provider) throw new EnterpriseRetailError("RETAIL_PROVIDER_NOT_FOUND", 409, { providerCode });
  return provider;
}

async function assertTelcoFloatAccountTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  financialAccountId: string,
  currencyCode?: string,
) {
  const account = await tx.enterpriseFinancialAccount.findFirst({
    where: {
      organizationId,
      id: financialAccountId,
      accountType: { in: ["MOBILE_MONEY", "CLEARING"] },
      status: "ACTIVE",
      archivedAt: null,
      ...(currencyCode ? { currencyCode } : {}),
    },
  });
  if (!account) throw new EnterpriseRetailError("RETAIL_FINANCIAL_ACCOUNT_INVALID", 409, { financialAccountId, currencyCode });
  return account;
}

export async function resolveTelcoFloatAccountTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  provider: { id: string; providerCode: string; telcoFloatAccountId: string | null },
  currencyCode: string,
) {
  const normalizedCurrency = currencyCode.trim().toUpperCase();
  const mapping = await tx.enterpriseRetailProviderAccount.findUnique({
    where: {
      organizationId_providerId_accountUse_currencyCode: {
        organizationId,
        providerId: provider.id,
        accountUse: TELCO_FLOAT_ACCOUNT_USE,
        currencyCode: normalizedCurrency,
      },
    },
  });
  if (mapping?.isActive) {
    const account = await assertTelcoFloatAccountTx(tx, organizationId, mapping.financialAccountId, normalizedCurrency);
    return { mapping, account, legacyFallback: false };
  }

  // Compatibility window only. New Telco operations never choose this field when a canonical mapping exists.
  if (provider.telcoFloatAccountId) {
    const legacy = await tx.enterpriseFinancialAccount.findFirst({
      where: {
        organizationId,
        id: provider.telcoFloatAccountId,
        accountType: { in: ["MOBILE_MONEY", "CLEARING"] },
        currencyCode: normalizedCurrency,
        status: "ACTIVE",
        archivedAt: null,
      },
    });
    if (legacy) return { mapping: null, account: legacy, legacyFallback: true };
  }

  throw new EnterpriseRetailError("RETAIL_TELCO_CURRENCY_ACCOUNT_REQUIRED", 409, {
    providerCode: provider.providerCode,
    currencyCode: normalizedCurrency,
  });
}

export async function getTelcoProviderAccountConfiguration(organizationId: string) {
  const [organization, providers, mappings, financialAccounts, financeConfiguration] = await Promise.all([
    prisma.organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { country: true } }),
    prisma.enterpriseRetailProvider.findMany({
      where: { organizationId, providerType: { in: ["TELCO", "BOTH"] }, isActive: true },
      orderBy: { label: "asc" },
    }),
    prisma.enterpriseRetailProviderAccount.findMany({
      where: { organizationId, accountUse: TELCO_FLOAT_ACCOUNT_USE, isActive: true },
      orderBy: [{ providerCode: "asc" }, { currencyCode: "asc" }],
    }),
    prisma.enterpriseFinancialAccount.findMany({
      where: { organizationId, accountType: { in: ["MOBILE_MONEY", "CLEARING"] }, status: "ACTIVE", archivedAt: null },
      orderBy: [{ currencyCode: "asc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, accountType: true, currencyCode: true, operationalBalance: true, ledgerAccountId: true },
    }),
    prisma.enterpriseFinanceConfiguration.findUnique({
      where: { organizationId },
      select: { functionalCurrencyCode: true, presentationCurrencyCode: true },
    }),
  ]);
  if (!organization) throw new EnterpriseRetailError("RETAIL_ORGANIZATION_NOT_FOUND", 404);

  const accountById = new Map(financialAccounts.map((account) => [account.id, account]));
  const requiredCurrencies = requiredRetailOperatorCurrencies(organization.country);
  const availableCurrencies = Array.from(new Set([
    ...requiredCurrencies,
    ...financialAccounts.map((account) => account.currencyCode),
    ...(financeConfiguration?.functionalCurrencyCode ? [financeConfiguration.functionalCurrencyCode] : []),
    ...(financeConfiguration?.presentationCurrencyCode ? [financeConfiguration.presentationCurrencyCode] : []),
  ])).sort();

  const mappedProviders = providers.map((provider) => {
    const providerMappings = mappings
      .filter((mapping) => mapping.providerId === provider.id)
      .map((mapping) => ({ ...mapping, financialAccount: accountById.get(mapping.financialAccountId) || null }))
      .filter((mapping) => Boolean(mapping.financialAccount));
    const mappedCurrencies = new Set(providerMappings.map((mapping) => mapping.currencyCode));
    return {
      id: provider.id,
      providerCode: provider.providerCode,
      label: provider.label,
      providerType: provider.providerType,
      accounts: providerMappings,
      mappedCurrencyCount: mappedCurrencies.size,
      ready: isRetailOperatorCurrencyReady(organization.country, mappedCurrencies),
    };
  });

  return {
    country: organization.country,
    requiredCurrencies,
    minimumCurrencyCount: 2,
    availableCurrencies,
    financialAccounts,
    providers: mappedProviders,
  };
}

export async function upsertTelcoProviderAccount(
  organizationId: string,
  actorUserId: string,
  input: { providerCode: string; currencyCode: string; financialAccountId: string },
) {
  const currencyCode = input.currencyCode.trim().toUpperCase();
  return prisma.$transaction(async (tx) => {
    const provider = await assertTelcoProviderTx(tx, organizationId, input.providerCode);
    const account = await assertTelcoFloatAccountTx(tx, organizationId, input.financialAccountId, currencyCode);
    const mapping = await tx.enterpriseRetailProviderAccount.upsert({
      where: {
        organizationId_providerId_accountUse_currencyCode: {
          organizationId,
          providerId: provider.id,
          accountUse: TELCO_FLOAT_ACCOUNT_USE,
          currencyCode,
        },
      },
      update: {
        providerCode: provider.providerCode,
        financialAccountId: account.id,
        isActive: true,
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
      create: {
        organizationId,
        providerId: provider.id,
        providerCode: provider.providerCode,
        accountUse: TELCO_FLOAT_ACCOUNT_USE,
        currencyCode,
        financialAccountId: account.id,
        createdByUserId: actorUserId,
      },
    });

    const financeConfiguration = await tx.enterpriseFinanceConfiguration.findUnique({
      where: { organizationId },
      select: { functionalCurrencyCode: true },
    });
    if (!provider.telcoFloatAccountId || financeConfiguration?.functionalCurrencyCode === currencyCode) {
      await tx.enterpriseRetailProvider.update({
        where: { id: provider.id },
        data: { telcoFloatAccountId: account.id, revision: { increment: 1 } },
      });
    }

    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseRetailProviderAccount",
      entityId: mapping.id,
      eventType: "TELCO_PROVIDER_ACCOUNT_MAPPED",
      summary: provider.label + " " + currencyCode + " mapped to " + account.code,
      actorUserId,
      toStatus: "ACTIVE",
      metadataJson: { providerCode: provider.providerCode, currencyCode, financialAccountId: account.id, accountUse: TELCO_FLOAT_ACCOUNT_USE },
    });
    return mapping;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
`));

write("app/api/enterprise/[organizationId]/retail/telco-topups/accounts/route.ts", String.raw`import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { telcoProviderAccountUpsertSchema } from "@/lib/enterprise/retail/telco-multicurrency-schemas";
import { getTelcoProviderAccountConfiguration, upsertTelcoProviderAccount } from "@/lib/enterprise/retail/telco-multicurrency-service";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "TELCO_TOPUPS", "read");
  if (!auth.ok) return auth.response;
  try {
    const configuration = await getTelcoProviderAccountConfiguration(organizationId);
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "telco-provider-accounts" } });
    return NextResponse.json(configuration);
  } catch (error) {
    return retailErrorResponse(error, "TELCO_PROVIDER_ACCOUNTS_LOAD_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "TELCO_TOPUPS", "manage", { mutation: true, limit: 80 });
  if (!auth.ok) return auth.response;
  const parsed = telcoProviderAccountUpsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Configuration Télécom invalide." }, { status: 400 });
  try {
    const mapping = await upsertTelcoProviderAccount(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_TELCO_PROVIDER_ACCOUNT_MAPPED",
      entity: "EnterpriseRetailProviderAccount",
      entityId: mapping.id,
      request: req,
      metadata: { organizationId, providerCode: parsed.data.providerCode, currencyCode: parsed.data.currencyCode, financialAccountId: parsed.data.financialAccountId },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "telco-provider-accounts", action: "upsert" } });
    return NextResponse.json({ ok: true, mapping });
  } catch (error) {
    return retailErrorResponse(error, "TELCO_PROVIDER_ACCOUNT_UPSERT_FAILED");
  }
}
`);

write("app/api/enterprise/[organizationId]/retail/telco-topups/cash-sessions/[sessionId]/close/route.ts", String.raw`import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { submitCashSessionClose } from "@/lib/enterprise/accounting/treasury-service";
import { cashCloseSchema } from "@/lib/enterprise/accounting/treasury-schemas";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";

type Params = { params: Promise<{ organizationId: string; sessionId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, sessionId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "TELCO_TOPUPS", "submit", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = cashCloseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Clôture de caisse invalide." }, { status: 400 });
  try {
    const session = await submitCashSessionClose(organizationId, sessionId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_RETAIL_CASH_SESSION_SUBMITTED",
      entity: "EnterpriseCashSession",
      entityId: sessionId,
      request: req,
      metadata: {
        organizationId,
        financialAccountId: session.financialAccountId,
        expectedClosingAmount: session.expectedClosingAmount?.toFixed(),
        countedClosingAmount: session.countedClosingAmount?.toFixed(),
        discrepancyAmount: session.discrepancyAmount?.toFixed(),
        moduleCode: "TELCO_TOPUPS",
      },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-cash-sessions", action: "close", moduleCode: "TELCO_TOPUPS" } });
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_CASH_SESSION_CLOSE_FAILED");
  }
}
`);

write("prisma/migrations/20260814125000_telco_multicurrency_accounts/migration.sql", String.raw`-- DTSC #310 — Telco multi-currency operator accounts.
-- Additive data backfill only: the generic EnterpriseRetailProviderAccount table already exists.
-- Legacy EnterpriseRetailProvider.telcoFloatAccountId remains during the compatibility window.

INSERT INTO "EnterpriseRetailProviderAccount" (
  "id",
  "organizationId",
  "providerId",
  "providerCode",
  "accountUse",
  "currencyCode",
  "financialAccountId",
  "isActive",
  "createdByUserId",
  "updatedByUserId",
  "revision",
  "createdAt",
  "updatedAt"
)
SELECT
  'telmap_' || md5(p."organizationId" || ':' || p."id" || ':' || a."currencyCode"),
  p."organizationId",
  p."id",
  p."providerCode",
  'TELCO_FLOAT',
  a."currencyCode",
  a."id",
  true,
  'migration-310',
  NULL,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "EnterpriseRetailProvider" p
JOIN "EnterpriseFinancialAccount" a
  ON a."organizationId" = p."organizationId"
 AND a."id" = p."telcoFloatAccountId"
WHERE p."telcoFloatAccountId" IS NOT NULL
  AND p."providerType" IN ('TELCO', 'BOTH')
  AND a."accountType" IN ('MOBILE_MONEY', 'CLEARING')
  AND a."status" = 'ACTIVE'
  AND a."archivedAt" IS NULL
ON CONFLICT ("organizationId", "providerId", "accountUse", "currencyCode") DO NOTHING;
`);

// Share the country policy with Mobile Money instead of duplicating DRC logic.
replaceOnce(
  "lib/enterprise/retail/mobile-money-multicurrency-service.ts",
  'import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";\nimport { prisma } from "@/lib/prisma";',
  'import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";\nimport { requiredRetailOperatorCurrencies } from "@/lib/enterprise/retail/operator-currency-policy";\nimport { prisma } from "@/lib/prisma";',
);
replaceOnce(
  "lib/enterprise/retail/mobile-money-multicurrency-service.ts",
  'const DRC_COUNTRY_MARKERS = new Set(["CD", "COD", "RDC", "DRC", "CONGO RDC", "CONGO-KINSHASA", "DEMOCRATIC REPUBLIC OF THE CONGO"]);\n\nfunction normalizeCountry(value: string | null | undefined) {\n  return (value || "").trim().toUpperCase().replace(/[^A-Z -]/g, "");\n}\n\nexport function requiredMobileMoneyCurrencies(country: string | null | undefined) {\n  return DRC_COUNTRY_MARKERS.has(normalizeCountry(country)) ? ["CDF", "USD"] : [];\n}',
  'export function requiredMobileMoneyCurrencies(country: string | null | undefined) {\n  return requiredRetailOperatorCurrencies(country);\n}',
);

// Make Telco create path server-authoritative by operator + tender currency.
replaceOnce(
  "lib/enterprise/retail/service.ts",
  'import { resolveMobileMoneyFloatAccountTx } from "@/lib/enterprise/retail/mobile-money-multicurrency-service";',
  'import { resolveMobileMoneyFloatAccountTx } from "@/lib/enterprise/retail/mobile-money-multicurrency-service";\nimport { resolveTelcoFloatAccountTx } from "@/lib/enterprise/retail/telco-multicurrency-service";',
);
replaceOnce(
  "lib/enterprise/retail/service.ts",
  materialize(String.raw`    if (input.catalogItemId) {
      const catalogItem = await tx.enterpriseCatalogItem.findFirst({ where: { id: input.catalogItemId, organizationId, status: "ACTIVE", archivedAt: null } });
      if (!catalogItem) throw new EnterpriseRetailError("RETAIL_CATALOG_ITEM_INVALID", 409, { catalogItemId: input.catalogItemId });
    }
    const operatorFloatAccountId = input.operatorFloatAccountId || provider.telcoFloatAccountId;
    if (!operatorFloatAccountId) throw new EnterpriseRetailError("RETAIL_FLOAT_ACCOUNT_REQUIRED", 409, { providerCode: input.providerCode });
    const tenderAccount = await assertFinancialAccount(tx, organizationId, input.tenderFinancialAccountId, input.currencyCode, ["CASH", "MOBILE_MONEY", "BANK", "CLEARING"]);
    const operatorFloatAccount = await assertFinancialAccount(tx, organizationId, operatorFloatAccountId, input.currencyCode, ["MOBILE_MONEY", "CLEARING"]);`),
  materialize(String.raw`    const catalogItem = input.catalogItemId
      ? await tx.enterpriseCatalogItem.findFirst({ where: { id: input.catalogItemId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, currency: true } })
      : null;
    if (input.catalogItemId && !catalogItem) throw new EnterpriseRetailError("RETAIL_CATALOG_ITEM_INVALID", 409, { catalogItemId: input.catalogItemId });
    const tenderAccount = await assertFinancialAccount(tx, organizationId, input.tenderFinancialAccountId, input.currencyCode, ["CASH", "MOBILE_MONEY", "BANK", "CLEARING"]);
    if (catalogItem?.currency && catalogItem.currency !== tenderAccount.currencyCode) throw new EnterpriseRetailError("RETAIL_CURRENCY_MISMATCH", 409, { catalogItemId: catalogItem.id });
    const operatorFloatAccount = (await resolveTelcoFloatAccountTx(tx, organizationId, provider, tenderAccount.currencyCode)).account;`),
);

replaceOnce(
  "lib/enterprise/retail/http.ts",
  '  RETAIL_MOBILE_MONEY_CURRENCY_ACCOUNT_REQUIRED: "Configurez un wallet Mobile Money pour cet opérateur dans la devise de la caisse avant de continuer.",',
  '  RETAIL_MOBILE_MONEY_CURRENCY_ACCOUNT_REQUIRED: "Configurez un wallet Mobile Money pour cet opérateur dans la devise de la caisse avant de continuer.",\n  RETAIL_TELCO_CURRENCY_ACCOUNT_REQUIRED: "Configurez un compte opérateur Télécom dans la devise d’encaissement avant de continuer.",',
);

// Dashboard: expose Telco mappings and make readiness multi-currency.
replaceOnce(
  "lib/enterprise/retail/commercial-dashboard.ts",
  'import { getMobileMoneyProviderAccountConfiguration } from "@/lib/enterprise/retail/mobile-money-multicurrency-service";',
  'import { getMobileMoneyProviderAccountConfiguration } from "@/lib/enterprise/retail/mobile-money-multicurrency-service";\nimport { getTelcoProviderAccountConfiguration } from "@/lib/enterprise/retail/telco-multicurrency-service";',
);
replaceOnce(
  "lib/enterprise/retail/commercial-dashboard.ts",
  '    mobileMoneyConfiguration,\n  ] = await Promise.all([',
  '    mobileMoneyConfiguration,\n    telcoConfiguration,\n  ] = await Promise.all([',
);
replaceOnce(
  "lib/enterprise/retail/commercial-dashboard.ts",
  '    includeMobileMoney ? getMobileMoneyProviderAccountConfiguration(organizationId) : Promise.resolve(null),\n  ]);',
  '    includeMobileMoney ? getMobileMoneyProviderAccountConfiguration(organizationId) : Promise.resolve(null),\n    includeTelco ? getTelcoProviderAccountConfiguration(organizationId) : Promise.resolve(null),\n  ]);',
);
replaceOnce(
  "lib/enterprise/retail/commercial-dashboard.ts",
  '  const telcoNetworks = providers.filter((provider) => provider.providerType === "TELCO");\n',
  '',
);
replaceOnce(
  "lib/enterprise/retail/commercial-dashboard.ts",
  '  const allMobileMoneyProvidersReady = Boolean(\n    mobileMoneyConfiguration?.providers.length\n      && mobileMoneyConfiguration.providers.every((provider) => provider.ready),\n  );',
  '  const allMobileMoneyProvidersReady = Boolean(\n    mobileMoneyConfiguration?.providers.length\n      && mobileMoneyConfiguration.providers.every((provider) => provider.ready),\n  );\n  const allTelcoProvidersReady = Boolean(\n    telcoConfiguration?.providers.length\n      && telcoConfiguration.providers.every((provider) => provider.ready),\n  );',
);
replaceOnce(
  "lib/enterprise/retail/commercial-dashboard.ts",
  '    cashSessions,\n    metricsByCurrency,',
  '    cashSessions,\n    mobileMoneyConfiguration,\n    telcoConfiguration,\n    metricsByCurrency,',
);
replaceOnce(
  "lib/enterprise/retail/commercial-dashboard.ts",
  '      readyForTelco: canonicalReadiness.ready && telcoNetworks.some((provider) => Boolean(provider.telcoFloatAccountId)),',
  '      readyForTelco: canonicalReadiness.ready && allTelcoProvidersReady,',
);

// Reuse the same concurrent till UI for Telco, with domain-appropriate copy and RBAC close route.
replaceOnce(
  "components/enterprise/professional/mobile-money-cash-session-manager.tsx",
  '  organizationId,\n  accounts,',
  '  organizationId,\n  moduleCode = "MOBILE_MONEY_AGENCY",\n  accounts,',
);
replaceOnce(
  "components/enterprise/professional/mobile-money-cash-session-manager.tsx",
  '  organizationId: string;\n  accounts: CashAccount[];',
  '  organizationId: string;\n  moduleCode?: "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS";\n  accounts: CashAccount[];',
);
replaceOnce(
  "components/enterprise/professional/mobile-money-cash-session-manager.tsx",
  '  const copy = COPY[locale];\n  const cashAccounts = useMemo(',
  '  const copy = COPY[locale];\n  const telco = moduleCode === "TELCO_TOPUPS";\n  const operationTitle = telco ? (locale === "en" ? "My Telco tills" : "Mes caisses Télécom") : copy.title;\n  const operationDescription = telco\n    ? (locale === "en" ? "Keep CDF and USD tills open in parallel for cash top-ups and switch currency with one tap." : "Gardez les caisses CDF et USD ouvertes en parallèle pour les recharges en espèces et changez de devise en un toucher.")\n    : copy.description;\n  const actionScope = telco ? "telco" : "mobile-money";\n  const cashAccounts = useMemo(',
);
replaceOnce(
  "components/enterprise/professional/mobile-money-cash-session-manager.tsx",
  '<ModuleSection title={copy.title} description={copy.description}>',
  '<ModuleSection title={operationTitle} description={operationDescription}>',
);
replaceOnce(
  "components/enterprise/professional/mobile-money-cash-session-manager.tsx",
  '{locale === "en" ? "Open at least one till before recording a Mobile Money operation." : "Ouvrez au moins une caisse avant d’enregistrer une opération Mobile Money."}',
  '{telco\n                ? (locale === "en" ? "No cash till is open. You can open one for cash Telco top-ups; non-cash accounts remain available." : "Aucune caisse n’est ouverte. Vous pouvez en ouvrir une pour les recharges Télécom en espèces ; les comptes non-cash restent utilisables.")\n                : (locale === "en" ? "Open at least one till before recording a Mobile Money operation." : "Ouvrez au moins une caisse avant d’enregistrer une opération Mobile Money.")}',
);
replaceOnce(
  "components/enterprise/professional/mobile-money-cash-session-manager.tsx",
  '      `open-mobile-money-cash-${accountId}`,',
  '      `open-${actionScope}-cash-${accountId}`,',
);
replaceOnce(
  "components/enterprise/professional/mobile-money-cash-session-manager.tsx",
  '                  <Button disabled={Boolean(busyAction)}><Banknote className="h-4 w-4" />{busyAction?.startsWith("open-mobile-money-cash") ? copy.processing : copy.open}</Button>',
  '                  <Button disabled={Boolean(busyAction)}><Banknote className="h-4 w-4" />{busyAction?.startsWith(`open-${actionScope}-cash`) ? copy.processing : copy.open}</Button>',
);
replaceOnce(
  "components/enterprise/professional/mobile-money-cash-session-manager.tsx",
  '              organizationId={organizationId}\n              session={session}',
  '              organizationId={organizationId}\n              moduleCode={moduleCode}\n              session={session}',
);
replaceOnce(
  "components/enterprise/professional/mobile-money-cash-session-manager.tsx",
  '  organizationId,\n  session,\n  locale,',
  '  organizationId,\n  moduleCode,\n  session,\n  locale,',
);
replaceOnce(
  "components/enterprise/professional/mobile-money-cash-session-manager.tsx",
  '  organizationId: string;\n  session: MobileMoneyCashSession;',
  '  organizationId: string;\n  moduleCode: "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS";\n  session: MobileMoneyCashSession;',
);
replaceOnce(
  "components/enterprise/professional/mobile-money-cash-session-manager.tsx",
  '  const copy = COPY[locale];\n  const currency = session.financialAccount.currencyCode;',
  '  const copy = COPY[locale];\n  const actionScope = moduleCode === "TELCO_TOPUPS" ? "telco" : "mobile-money";\n  const closeEndpoint = moduleCode === "TELCO_TOPUPS"\n    ? `/api/enterprise/${organizationId}/retail/telco-topups/cash-sessions/${session.id}/close`\n    : `/api/enterprise/${organizationId}/retail/cash-sessions/${session.id}/close`;\n  const currency = session.financialAccount.currencyCode;',
);
replaceOnce(
  "components/enterprise/professional/mobile-money-cash-session-manager.tsx",
  '      `close-mobile-money-cash-${session.id}`,\n      `/api/enterprise/${organizationId}/retail/cash-sessions/${session.id}/close`,',
  '      `close-${actionScope}-cash-${session.id}`,\n      closeEndpoint,',
);
replaceOnce(
  "components/enterprise/professional/mobile-money-cash-session-manager.tsx",
  '{busyAction === `close-mobile-money-cash-${session.id}` ? copy.processing : copy.submitClose}',
  '{busyAction === `close-${actionScope}-cash-${session.id}` ? copy.processing : copy.submitClose}',
);

// Hide the legacy single-till banner for both multi-till operator modules.
replaceOnce(
  "components/enterprise/professional/retail-workspace-shared.tsx",
  '{context.dashboard && moduleCode !== "MOBILE_MONEY_AGENCY" ? <CashSessionBar session={context.dashboard.cashSession} locale={locale} /> : null}',
  '{context.dashboard && moduleCode === "RETAIL_POS" ? <CashSessionBar session={context.dashboard.cashSession} locale={locale} /> : null}',
);

// Telco workspace: use concurrent tills + provider/currency mappings.
replaceOnce(
  "components/enterprise/professional/retail-operator-workspace.tsx",
  '"use client";\n\nimport { useState } from "react";',
  '"use client";\n\nimport Link from "next/link";\nimport { useEffect, useMemo, useState } from "react";',
);
replaceOnce(
  "components/enterprise/professional/retail-operator-workspace.tsx",
  'import { useAppLocale } from "@/components/i18n/locale-provider";',
  'import { useAppLocale } from "@/components/i18n/locale-provider";\nimport { MobileMoneyCashSessionManager as RetailMultiCashSessionManager, type MobileMoneyCashSession as OperatorCashSession } from "@/components/enterprise/professional/mobile-money-cash-session-manager";',
);
replaceOnce(
  "components/enterprise/professional/retail-operator-workspace.tsx",
  '        return moduleCode === "MOBILE_MONEY_AGENCY"\n          ? <MobileMoneyPanel organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} />\n          : <TelcoPanel organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} />;',
  '        return moduleCode === "MOBILE_MONEY_AGENCY"\n          ? <MobileMoneyPanel organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} />\n          : <TelcoPanel organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} reload={async () => context.setRefreshKey((value) => value + 1)} />;',
);

const telcoTypes = materialize(String.raw`
type TelcoCurrencyAccount = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  currencyCode: string;
  operationalBalance: string | number;
  ledgerAccountId: string;
};

type TelcoProviderMapping = {
  id: string;
  currencyCode: string;
  financialAccountId: string;
  revision: number;
  financialAccount: TelcoCurrencyAccount;
};

type TelcoProviderConfiguration = {
  id: string;
  providerCode: string;
  label: string;
  providerType: string;
  accounts: TelcoProviderMapping[];
  mappedCurrencyCount: number;
  ready: boolean;
};

type TelcoConfiguration = {
  country: string | null;
  requiredCurrencies: string[];
  minimumCurrencyCount: number;
  availableCurrencies: string[];
  financialAccounts: TelcoCurrencyAccount[];
  providers: TelcoProviderConfiguration[];
};

type TelcoDashboard = RetailDashboard & {
  cashSessions?: OperatorCashSession[];
  telcoConfiguration?: TelcoConfiguration | null;
};

type TelcoDraft = {
  providerCode: string;
  destinationPhone: string;
  catalogItemId: string | null;
  offerLabel: string;
  currencyCode: string;
  saleAmount: number;
  operatorCost: number;
  tenderFinancialAccountId: string;
  operatorFloatAccountId: null;
  externalReference: string | null;
  status: string;
  failureReason: string | null;
};
`);
replaceOnce(
  "components/enterprise/professional/retail-operator-workspace.tsx",
  'import {\n  customerFacingFeeCollectionMode,\n  customerFacingMobileMoneyTransactionType,\n} from "@/lib/retail-customer-language";\n',
  'import {\n  customerFacingFeeCollectionMode,\n  customerFacingMobileMoneyTransactionType,\n} from "@/lib/retail-customer-language";\n' + telcoTypes,
);

const telcoPanel = materialize(String.raw`function TelcoPanel({ organizationId, dashboard, locale, busyAction, mutate, reload }: { organizationId: string; dashboard: RetailDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation; reload: () => Promise<void> }) {
  const telcoDashboard = dashboard as TelcoDashboard;
  const configuration = telcoDashboard.telcoConfiguration || null;
  const sessions = telcoDashboard.cashSessions || [];
  const openSessions = useMemo(() => sessions.filter((session) => session.status === "OPEN"), [sessions]);
  const [selectedCashSessionId, setSelectedCashSessionId] = useState("");
  const [tenderMethod, setTenderMethod] = useState<"CASH" | "NON_CASH">("CASH");
  const [nonCashAccountId, setNonCashAccountId] = useState("");
  const [status, setStatus] = useState("SUCCESS");
  const [pending, setPending] = useState<TelcoDraft | null>(null);

  useEffect(() => {
    if (!openSessions.length) {
      if (selectedCashSessionId) setSelectedCashSessionId("");
      return;
    }
    if (!openSessions.some((session) => session.id === selectedCashSessionId)) setSelectedCashSessionId(openSessions[0].id);
  }, [openSessions, selectedCashSessionId]);

  const activeCash = openSessions.find((session) => session.id === selectedCashSessionId) || openSessions[0] || null;
  const nonCashAccounts = useMemo(
    () => dashboard.accounts.filter((account) => ["MOBILE_MONEY", "BANK", "CLEARING"].includes(account.accountType)),
    [dashboard.accounts],
  );

  useEffect(() => {
    if (tenderMethod !== "NON_CASH") return;
    if (!nonCashAccounts.some((account) => account.id === nonCashAccountId)) setNonCashAccountId(nonCashAccounts[0]?.id || "");
  }, [nonCashAccountId, nonCashAccounts, tenderMethod]);

  const tenderAccount = tenderMethod === "CASH"
    ? (activeCash ? dashboard.accounts.find((account) => account.id === activeCash.financialAccount.id) || null : null)
    : nonCashAccounts.find((account) => account.id === nonCashAccountId) || null;
  const currency = tenderAccount?.currencyCode || "";
  const eligibleProviders = useMemo(
    () => (configuration?.providers || []).filter((provider) => provider.accounts.some((mapping) => mapping.currencyCode === currency)),
    [configuration, currency],
  );
  const eligibleCatalog = useMemo(
    () => (dashboard.catalogItems || []).filter((item) => !item.currency || item.currency === currency),
    [currency, dashboard.catalogItems],
  );

  useEffect(() => { setPending(null); }, [selectedCashSessionId, tenderMethod, nonCashAccountId]);

  async function confirm() {
    if (!pending) return;
    const body = await mutate(
      "telco-topup",
      `/api/enterprise/¤{organizationId}/retail/telco-topups`,
      pending,
      locale === "en" ? "Top-up recorded in the selected currency." : "Recharge enregistrée dans la devise sélectionnée.",
    );
    if (body) setPending(null);
  }

  const selectedProvider = pending ? configuration?.providers.find((provider) => provider.providerCode === pending.providerCode) || null : null;
  const selectedOperatorAccount = pending ? selectedProvider?.accounts.find((mapping) => mapping.currencyCode === pending.currencyCode)?.financialAccount || null : null;
  const selectedTenderAccount = pending ? dashboard.accounts.find((account) => account.id === pending.tenderFinancialAccountId) || null : null;

  return (
    <div className="grid min-w-0 gap-5">
      <RetailMultiCashSessionManager
        organizationId={organizationId}
        moduleCode="TELCO_TOPUPS"
        accounts={dashboard.accounts}
        sessions={sessions}
        selectedSessionId={selectedCashSessionId}
        onSelectSession={(sessionId) => { setSelectedCashSessionId(sessionId); setTenderMethod("CASH"); setPending(null); }}
        locale={locale}
        busyAction={busyAction}
        mutate={mutate}
        reload={reload}
      />

      <ModuleSection
        title={locale === "en" ? "Airtime / bundle" : "Crédit / forfait"}
        description={locale === "en"
          ? "Choose the payment account first. Its currency determines the eligible operator account automatically, so the same network can be used in CDF or USD without reconfiguration."
          : "Choisissez d’abord le compte d’encaissement. Sa devise détermine automatiquement le compte opérateur éligible : un même réseau peut ainsi être exploité en CDF ou en USD sans reconfiguration."}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const providerCode = String(form.get("providerCode") || "");
            const provider = eligibleProviders.find((item) => item.providerCode === providerCode);
            const externalReference = String(form.get("externalReference") || "").trim();
            if (!provider || !tenderAccount || !currency || (status === "SUCCESS" && !externalReference)) return;
            setPending({
              providerCode,
              destinationPhone: normalizePhonePreview(String(form.get("destinationPhone") || "")),
              catalogItemId: String(form.get("catalogItemId") || "") || null,
              offerLabel: String(form.get("offerLabel") || ""),
              currencyCode: currency,
              saleAmount: Number(form.get("saleAmount") || 0),
              operatorCost: Number(form.get("operatorCost") || 0),
              tenderFinancialAccountId: tenderAccount.id,
              operatorFloatAccountId: null,
              externalReference: externalReference || null,
              status,
              failureReason: String(form.get("failureReason") || "").trim() || null,
            });
          }}
          className="grid min-w-0 gap-4"
        >
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <Field label={locale === "en" ? "Payment method" : "Mode d’encaissement"}>
              <Select name="tenderMethod" value={tenderMethod} onChange={(value) => { setTenderMethod(value === "NON_CASH" ? "NON_CASH" : "CASH"); setPending(null); }} disabled={Boolean(busyAction)}>
                <option value="CASH">{locale === "en" ? "Cash till" : "Caisse espèces"}</option>
                <option value="NON_CASH">{locale === "en" ? "Other financial account" : "Autre compte financier"}</option>
              </Select>
            </Field>
            <Field label={locale === "en" ? "Payment account & currency" : "Compte d’encaissement et devise"}>
              {tenderMethod === "CASH" ? (
                <Input value={activeCash ? activeCash.financialAccount.name + " · " + activeCash.financialAccount.currencyCode : (locale === "en" ? "Open or select a cash till" : "Ouvrez ou sélectionnez une caisse")} readOnly />
              ) : (
                <Select name="tenderAccountId" value={nonCashAccountId} onChange={(value) => { setNonCashAccountId(value); setPending(null); }} required disabled={Boolean(busyAction)}>
                  <option value="">—</option>
                  {nonCashAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode} · {customerFacingFinancialAccountType(account.accountType, locale)}</option>)}
                </Select>
              )}
            </Field>
            <Field label={locale === "en" ? "Network" : "Opérateur réseau"}>
              <Select name="providerCode" required disabled={Boolean(busyAction) || !currency}>
                <option value="">—</option>
                {eligibleProviders.map((provider) => <option key={provider.id} value={provider.providerCode}>{provider.label}</option>)}
              </Select>
            </Field>
            <Field label={locale === "en" ? "Destination phone" : "Numéro destinataire"}><Input name="destinationPhone" required inputMode="tel" placeholder={locale === "en" ? "+country code…" : "+indicatif pays…"} disabled={Boolean(busyAction)} /></Field>
            <Field label={locale === "en" ? "Catalog offer (optional)" : "Offre catalogue (facultatif)"}>
              <Select name="catalogItemId" disabled={Boolean(busyAction) || !currency}><option value="">—</option>{eligibleCatalog.map((item) => <option key={item.id} value={item.id}>{item.name}{item.currency ? " · " + item.currency : ""}</option>)}</Select>
            </Field>
            <Field label={locale === "en" ? "Offer label" : "Libellé du forfait"}><Input name="offerLabel" required disabled={Boolean(busyAction)} /></Field>
            <Field label={locale === "en" ? "Sale price" : "Prix de vente"}><Input name="saleAmount" type="number" min="0.01" step="0.01" required disabled={Boolean(busyAction)} /></Field>
            <Field label={locale === "en" ? "Operator cost" : "Coût opérateur"}><Input name="operatorCost" type="number" min="0" step="0.01" required disabled={Boolean(busyAction)} /></Field>
            <Field label={locale === "en" ? "Execution status" : "Statut de l’opération"}>
              <Select name="status" value={status} onChange={(value) => { setStatus(value); setPending(null); }} disabled={Boolean(busyAction)}><option value="SUCCESS">{customerFacingStatusLabel("SUCCESS", locale)}</option><option value="FAILED">{customerFacingStatusLabel("FAILED", locale)}</option></Select>
            </Field>
            <Field label={locale === "en" ? "Operator reference" : "Référence opérateur"}><Input name="externalReference" maxLength={160} required={status === "SUCCESS"} disabled={Boolean(busyAction)} /></Field>
            {status === "FAILED" ? <Field label={locale === "en" ? "Failure reason" : "Motif d’échec"}><Input name="failureReason" minLength={3} maxLength={500} required disabled={Boolean(busyAction)} /></Field> : null}
          </div>

          <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-muted">
            {tenderAccount && currency
              ? (locale === "en" ? "Operational currency" : "Devise opérationnelle") + ": " + currency + " · " + (locale === "en" ? "payment account" : "encaissement") + ": " + tenderAccount.name
              : (locale === "en" ? "Select an available payment account before continuing." : "Sélectionnez un compte d’encaissement disponible avant de continuer.")}
          </div>
          {currency && configuration && !eligibleProviders.length ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-800 dark:text-amber-200">
              {locale === "en" ? "No network has an operator account configured in this currency." : "Aucun réseau ne possède encore de compte opérateur dans cette devise."} {" "}
              <Link href="#telco-provider-account-configuration" className="underline">{locale === "en" ? "Configure operator accounts" : "Configurer les comptes opérateur"}</Link>
            </div>
          ) : null}
          <Button className="w-fit" disabled={Boolean(busyAction) || !tenderAccount || !currency || !eligibleProviders.length}>
            <RadioTower className="h-4 w-4" />{locale === "en" ? "Review top-up" : "Vérifier la recharge"}
          </Button>
        </form>
      </ModuleSection>

      {pending ? (
        <ConfirmationCard
          locale={locale}
          title={locale === "en" ? "Confirm top-up" : "Confirmer la recharge"}
          lines={[
            selectedProvider?.label || (locale === "en" ? "Network operator" : "Opérateur réseau"),
            pending.offerLabel + " · " + moneyValue(pending.saleAmount, pending.currencyCode),
            String(pending.destinationPhone),
            (locale === "en" ? "Payment account" : "Compte d’encaissement") + ": " + (selectedTenderAccount?.name || "—") + " · " + pending.currencyCode,
            (locale === "en" ? "Operator account" : "Compte opérateur") + ": " + (selectedOperatorAccount?.name || "—") + " · " + pending.currencyCode,
            (locale === "en" ? "Operator reference" : "Référence opérateur") + ": " + (pending.externalReference || "—"),
            locale === "en" ? "Check the phone number and currency carefully before confirming." : "Vérifiez soigneusement le numéro et la devise avant de confirmer.",
          ]}
          busy={busyAction === "telco-topup"}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirm()}
        />
      ) : null}
      <RetailErpLinks moduleCode="TELCO_TOPUPS" locale={locale} />
    </div>
  );
}

`);
replaceBetween(
  "components/enterprise/professional/retail-operator-workspace.tsx",
  "function TelcoPanel(",
  "function ConfirmationCard(",
  telcoPanel,
);

const telcoConfiguration = materialize(String.raw`function TelcoProviderConfiguration({ organizationId, dashboard, locale, busyAction, mutate }: { organizationId: string; dashboard: RetailDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation }) {
  const telcoDashboard = dashboard as TelcoDashboard;
  const configuration = telcoDashboard.telcoConfiguration;
  const [extraCurrency, setExtraCurrency] = useState<Record<string, string>>({});

  if (!configuration) return <EmptyState compact title={locale === "en" ? "Telecom configuration unavailable" : "Configuration Télécom indisponible"} description={locale === "en" ? "Refresh the page and try again." : "Actualisez la page puis réessayez."} />;

  async function save(provider: TelcoProviderConfiguration, currencyCode: string, financialAccountId: string) {
    if (!financialAccountId || !currencyCode) return;
    await mutate(
      `telco-account-¤{provider.id}-¤{currencyCode}`,
      `/api/enterprise/¤{organizationId}/retail/telco-topups/accounts`,
      { providerCode: provider.providerCode, currencyCode, financialAccountId },
      locale === "en" ? "Operator account saved." : "Compte opérateur enregistré.",
      { idempotent: false },
    );
  }

  return (
    <div id="telco-provider-account-configuration" className="grid min-w-0 gap-5">
      <ModuleSection
        title={locale === "en" ? "Telecom operator accounts by currency" : "Comptes opérateur Télécom par devise"}
        description={locale === "en"
          ? "Each network is displayed once. Link a separate real operator account for every currency you use; in DR Congo, CDF and USD are expected."
          : "Chaque réseau reste affiché une seule fois. Associez-lui un compte opérateur réel distinct pour chaque devise exploitée ; en RDC, CDF et USD sont attendus."}
      >
        <div className="mb-4 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-muted">
          {configuration.requiredCurrencies.length
            ? (locale === "en" ? "Required in this country" : "Requis dans ce pays") + ": " + configuration.requiredCurrencies.join(" + ")
            : (locale === "en" ? "Configure at least two operating currencies per active network." : "Configurez au moins deux devises d’exploitation par réseau actif.")}
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          {configuration.providers.map((provider) => {
            const mappedCurrencies = provider.accounts.map((mapping) => mapping.currencyCode);
            const displayedCurrencies = configuration.requiredCurrencies.length
              ? Array.from(new Set([...configuration.requiredCurrencies, ...mappedCurrencies]))
              : mappedCurrencies;
            const addable = configuration.availableCurrencies.filter((currency) => !displayedCurrencies.includes(currency));
            const draftCurrency = extraCurrency[provider.id] || addable[0] || "";
            return (
              <article key={provider.id} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-black text-dtsc-ink">{provider.label}</p>
                    <p className="mt-1 text-xs font-semibold text-dtsc-muted">{provider.mappedCurrencyCount} {locale === "en" ? "currencies configured" : "devises configurées"}</p>
                  </div>
                  <StatusBadge tone={provider.ready ? "success" : "warning"}>{provider.ready ? (locale === "en" ? "Ready" : "Prêt") : (locale === "en" ? "To complete" : "À compléter")}</StatusBadge>
                </div>

                <div className="mt-4 grid gap-3">
                  {displayedCurrencies.map((currencyCode) => {
                    const mapping = provider.accounts.find((account) => account.currencyCode === currencyCode);
                    const accounts = configuration.financialAccounts.filter((account) => account.currencyCode === currencyCode);
                    return (
                      <form
                        key={provider.id + "-" + currencyCode + "-" + (mapping?.financialAccountId || "new")}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = new FormData(event.currentTarget);
                          void save(provider, currencyCode, String(form.get("operatorAccountId") || ""));
                        }}
                        className="grid gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end"
                      >
                        <div className="min-w-16 self-center text-lg font-black text-dtsc-ink">{currencyCode}</div>
                        <Field label={locale === "en" ? "Operator financial account" : "Compte financier opérateur"}>
                          <Select name="operatorAccountId" defaultValue={mapping?.financialAccountId || ""} disabled={!dashboard.access.canManage || Boolean(busyAction)} required>
                            <option value="">—</option>
                            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {customerFacingFinancialAccountType(account.accountType, locale)}</option>)}
                          </Select>
                        </Field>
                        {dashboard.access.canManage ? <Button size="sm" disabled={Boolean(busyAction) || !accounts.length}><Settings2 className="h-4 w-4" />{locale === "en" ? "Save" : "Enregistrer"}</Button> : null}
                      </form>
                    );
                  })}

                  {dashboard.access.canManage && addable.length ? (
                    <form
                      key={provider.id + "-extra-" + draftCurrency}
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        void save(provider, String(form.get("currencyCode") || ""), String(form.get("operatorAccountId") || ""));
                      }}
                      className="grid gap-3 rounded-xl border border-dashed border-dtsc-border bg-dtsc-surface p-3 sm:grid-cols-2"
                    >
                      <Field label={locale === "en" ? "Add currency" : "Ajouter une devise"}>
                        <Select name="currencyCode" value={draftCurrency} onChange={(value) => setExtraCurrency((current) => ({ ...current, [provider.id]: value }))} disabled={Boolean(busyAction)}>
                          {addable.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                        </Select>
                      </Field>
                      <Field label={locale === "en" ? "Operator financial account" : "Compte financier opérateur"}>
                        <Select name="operatorAccountId" required disabled={Boolean(busyAction)}><option value="">—</option>{configuration.financialAccounts.filter((account) => account.currencyCode === draftCurrency).map((account) => <option key={account.id} value={account.id}>{account.name} · {customerFacingFinancialAccountType(account.accountType, locale)}</option>)}</Select>
                      </Field>
                      <Button className="sm:col-span-2 sm:w-fit" disabled={Boolean(busyAction)}><Settings2 className="h-4 w-4" />{locale === "en" ? "Add account" : "Ajouter le compte"}</Button>
                    </form>
                  ) : null}
                </div>
              </article>
            );
          })}
          {!configuration.providers.length ? <EmptyState compact title={locale === "en" ? "No network enabled" : "Aucun réseau activé"} description={locale === "en" ? "Enable a Telecom network before mapping its accounts." : "Activez un réseau Télécom avant d’associer ses comptes."} /> : null}
        </div>
      </ModuleSection>
      <RetailErpLinks moduleCode="TELCO_TOPUPS" locale={locale} />
    </div>
  );
}

`);
replaceOnce(
  "components/enterprise/professional/retail-operator-workspace.tsx",
  'function ProviderConfiguration({ organizationId, moduleCode, dashboard, locale, busyAction, mutate }: { organizationId: string; moduleCode: "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS"; dashboard: RetailDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation }) {\n  const expectedType = moduleCode === "MOBILE_MONEY_AGENCY" ? "MOBILE_MONEY" : "TELCO";',
  telcoConfiguration + 'function ProviderConfiguration({ organizationId, moduleCode, dashboard, locale, busyAction, mutate }: { organizationId: string; moduleCode: "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS"; dashboard: RetailDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation }) {\n  if (moduleCode === "TELCO_TOPUPS") return <TelcoProviderConfiguration organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={busyAction} mutate={mutate} />;\n  const expectedType = "MOBILE_MONEY";',
);

// Domain documentation: replace the legacy Telco section and widen the cash-session wording.
const docsFile = "docs/ERP_RETAIL_TELCO_MOBILE_MONEY.md";
const telcoDocs = materialize(String.raw`## Télécom & forfaits — §TELCO_TOPUPS§

Cette capacité est une extension Retail optionnelle.

### Comptes opérateur multi-devise

§EnterpriseRetailProviderAccount§ est également la source canonique des comptes opérateur Télécom. Pour cet usage, §accountUse = TELCO_FLOAT§ associe une organisation, un réseau, une devise et un vrai compte financier compatible (§MOBILE_MONEY§ ou §CLEARING§).

Un même réseau reste affiché une seule fois mais peut disposer de plusieurs comptes par devise. En RDC, la readiness attend au minimum **CDF + USD** pour chaque réseau actif ; hors RDC, au moins deux devises explicitement configurées sont attendues. Le champ historique §telcoFloatAccountId§ reste uniquement un pont de compatibilité pendant le cutover et n’est plus l’autorité des nouvelles recharges.

La devise d’une recharge est déterminée par le compte d’encaissement réellement utilisé :

- paiement en espèces : la caisse §OPEN§ sélectionnée fixe la devise ;
- paiement non-cash : le compte financier d’encaissement sélectionné fixe la devise.

Le serveur revalide ce compte puis résout le compte opérateur par §organizationId + provider + TELCO_FLOAT + currencyCode§. Le navigateur ne peut donc pas imposer arbitrairement §operatorFloatAccountId§. Si aucun compte opérateur n’existe dans la devise d’encaissement, la recharge est refusée avant tout mouvement financier.

Lorsqu’une offre Catalogue porte une devise explicite, elle doit correspondre à la devise d’encaissement. Une recharge §SUCCESS§ crédite l’encaissement du prix de vente et débite uniquement le compte opérateur de la même devise du coût opérateur. Une opération §FAILED§ ne modifie pas les soldes.

L’annulation reste historique et non destructive : §EnterpriseTelcoTopup.operatorFloatAccountId§ et §tenderFinancialAccountId§ mémorisent les comptes réellement utilisés au moment de l’opération. Une reconfiguration ultérieure CDF/USD ne peut donc pas déplacer un reversal sur un autre compte.

### UX Télécom

Chaque carte réseau affiche ses comptes configurés par devise avec leur état de readiness. Pour une recharge cash, l’agent peut garder plusieurs caisses ouvertes en parallèle — notamment CDF et USD — et basculer en un toucher. Pour un encaissement non-cash, le choix du compte change immédiatement la devise et la liste des réseaux éligibles. Le récapitulatif avant confirmation affiche le réseau, la devise, le compte d’encaissement et le compte opérateur résolu.

Le mode connecté conserve la même autorité serveur : la confirmation provider converge vers §createTelcoTopup(...)§, qui résout à nouveau le mapping canonique avant de matérialiser les effets financiers.

`);
replaceBetween(docsFile, "## Télécom & forfaits — `TELCO_TOPUPS`", "## Sessions de caisse", telcoDocs + "## Sessions de caisse");
replaceOnce(
  docsFile,
  'Dans `MOBILE_MONEY_AGENCY`, un même cashier peut garder plusieurs sessions `OPEN` en parallèle lorsque les comptes cash sont distincts, par exemple une caisse CDF et une caisse USD en RDC. L’interface expose toutes ses caisses ouvertes, permet d’en choisir une comme caisse opérationnelle et d’en ouvrir une autre sans fermer la première.',
  'Dans `MOBILE_MONEY_AGENCY` et `TELCO_TOPUPS`, un même cashier peut garder plusieurs sessions `OPEN` en parallèle lorsque les comptes cash sont distincts, par exemple une caisse CDF et une caisse USD en RDC. Les interfaces opérateur exposent toutes ses caisses ouvertes, permettent d’en choisir une comme caisse opérationnelle et d’en ouvrir une autre sans fermer la première.',
);
replaceOnce(
  docsFile,
  'Une session `CLOSING` ou `PENDING_VALIDATION` n’est jamais une caisse utilisable pour de nouvelles opérations. Chaque caisse Mobile Money est comptée et soumise séparément en fin de journée, puis suit l’approbation Finance indépendante existante.',
  'Une session `CLOSING` ou `PENDING_VALIDATION` n’est jamais une caisse utilisable pour de nouvelles opérations. Chaque caisse utilisée dans les parcours Mobile Money ou Télécom est comptée et soumise séparément en fin de journée, puis suit l’approbation Finance indépendante existante.',
);

// Update the user guide in FR and EN without exposing technical identifiers.
const guideFile = "lib/user-guides/retail-telco-mobile-money-guides.ts";
replaceOnce(guideFile,
  '    summary: "Exploiter les recharges Télécom en séparant réseau et wallet, avec coût/marge, mode manuel ou connecté, provider asynchrone et rapprochement.",',
  '    summary: "Exploiter les recharges Télécom multi-devise en séparant réseau, comptes opérateur et encaissement, avec coût/marge, mode manuel ou connecté et rapprochement.",');
replaceOnce(guideFile,
  '    updatedAt: "2026-08-08",\n    capabilities: ["Extension Retail optionnelle", "Réseaux configurables", "Séparation réseau/wallet", "Coût et marge", "Mode MANUAL ou CONNECTED", "États provider asynchrones", "Webhooks signés idempotents", "Timeout/UNKNOWN/RECONCILED", "Annulation auditée"],\n    steps: [\n      { title: "Configurer le réseau et le float", description: "Reliez chaque opérateur au compte réel de float/clearing et vérifiez la devise. Le réseau Télécom Vodacom reste distinct du wallet Mobile Money M-Pesa, même lorsqu’ils appartiennent au même écosystème commercial." },',
  '    updatedAt: "2026-08-14",\n    capabilities: ["Extension Retail optionnelle", "Réseaux configurables", "Comptes opérateur CDF/USD par réseau", "Plusieurs caisses CDF/USD simultanées", "Encaissement non-cash multi-devise", "Coût et marge", "Mode MANUAL ou CONNECTED", "États provider asynchrones", "Webhooks signés idempotents", "Timeout/UNKNOWN/RECONCILED", "Annulation auditée"],\n    steps: [\n      { title: "Configurer les comptes du réseau", description: "Associez chaque réseau à un compte opérateur distinct pour chaque devise exploitée. En RDC, configurez CDF et USD. Le réseau Télécom Vodacom reste distinct du wallet Mobile Money M-Pesa, même lorsqu’ils appartiennent au même écosystème commercial." },');
replaceOnce(guideFile,
  '      { title: "Exécuter et suivre", description: "Saisissez numéro, offre, prix et coût. Une opération connectée peut rester pending ou unknown sans toucher prématurément au float." },',
  '      { title: "Exécuter et suivre", description: "Pour les espèces, sélectionnez la caisse CDF ou USD à utiliser ; pour un autre paiement, choisissez le compte d’encaissement. La devise de ce compte sélectionne automatiquement le compte opérateur correspondant. Saisissez ensuite numéro, offre, prix et coût." },');
replaceOnce(guideFile,
  '    summary: "Operate Telco top-ups with strict network/wallet separation, cost/margin, manual or connected provider mode and reconciliation.",',
  '    summary: "Operate multi-currency Telco top-ups with separated network, operator and tender accounts, cost/margin, manual or connected provider mode and reconciliation.",');
replaceOnce(guideFile,
  '    updatedAt: "2026-08-08",\n    capabilities: ["Optional Retail extension", "Configurable networks", "Network/wallet separation", "Cost and margin", "MANUAL or CONNECTED mode", "Asynchronous provider states", "Signed idempotent webhooks", "Timeout/UNKNOWN/RECONCILED", "Audited reversal"],\n    steps: [\n      { title: "Configure network and float", description: "Link each operator to its real float/clearing account and verify currency. The Vodacom Telco network remains distinct from the M-Pesa Mobile Money wallet." },',
  '    updatedAt: "2026-08-14",\n    capabilities: ["Optional Retail extension", "Configurable networks", "CDF/USD operator accounts per network", "Concurrent CDF/USD cash tills", "Multi-currency non-cash tender accounts", "Cost and margin", "MANUAL or CONNECTED mode", "Asynchronous provider states", "Signed idempotent webhooks", "Timeout/UNKNOWN/RECONCILED", "Audited reversal"],\n    steps: [\n      { title: "Configure network accounts", description: "Link each network to a distinct operator account for every operating currency. In DR Congo configure CDF and USD. The Vodacom Telco network remains distinct from the M-Pesa Mobile Money wallet." },');
replaceOnce(guideFile,
  '      { title: "Execute and follow", description: "Enter destination, offer, price and cost. Pending/unknown operations do not prematurely change float." },',
  '      { title: "Execute and follow", description: "For cash, select the CDF or USD till; for other payments, select the tender account. That account currency automatically selects the matching operator account. Then enter destination, offer, price and cost." },');

// Targeted QA for #310.
write("scripts/qa-310-telco-multicurrency.mjs", materialize(String.raw`import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const hasAll = (source, markers) => markers.every((marker) => source.includes(marker));

const schema = read("prisma/enterprise-retail-mobile-money-multicurrency.prisma");
check(hasAll(schema, ["model EnterpriseRetailProviderAccount", "@@unique([organizationId, providerId, accountUse, currencyCode])"]), "Telco must reuse the canonical provider/currency account mapping model");

const providerSchema = read("prisma/enterprise-retail.prisma");
check(providerSchema.includes("telcoFloatAccountId       String?"), "Legacy telcoFloatAccountId must remain during the compatibility window");
check(providerSchema.includes("operatorFloatAccountId   String"), "Top-ups must retain the historical operator account used for safe reversal");

const migration = read("prisma/migrations/20260814125000_telco_multicurrency_accounts/migration.sql");
check(hasAll(migration, ['p."telcoFloatAccountId"', "'TELCO_FLOAT'", 'a."currencyCode"', "ON CONFLICT", "'MOBILE_MONEY', 'CLEARING'"]), "Telco migration must additively backfill legacy mappings by real account currency");
check(!migration.includes("DROP COLUMN") && !migration.includes("DROP TABLE"), "Telco migration must remain additive");

const policy = read("lib/enterprise/retail/operator-currency-policy.ts");
check(hasAll(policy, ["requiredRetailOperatorCurrencies", 'return DRC_COUNTRY_MARKERS.has(normalizeCountry(country)) ? ["CDF", "USD"] : []', "mapped.size >= 2"]), "Shared operator currency policy must require CDF/USD in DRC and two configured currencies elsewhere");

const mobileService = read("lib/enterprise/retail/mobile-money-multicurrency-service.ts");
check(mobileService.includes("requiredRetailOperatorCurrencies"), "Mobile Money and Telco must share one DRC currency policy");

const telcoService = read("lib/enterprise/retail/telco-multicurrency-service.ts");
check(hasAll(telcoService, [
  'TELCO_FLOAT_ACCOUNT_USE = "TELCO_FLOAT"',
  'providerType: { in: ["TELCO", "BOTH"] }',
  'accountType: { in: ["MOBILE_MONEY", "CLEARING"] }',
  "organizationId_providerId_accountUse_currencyCode",
  "resolveTelcoFloatAccountTx",
  "provider.telcoFloatAccountId",
  "RETAIL_TELCO_CURRENCY_ACCOUNT_REQUIRED",
  "getTelcoProviderAccountConfiguration",
  "isRetailOperatorCurrencyReady",
  "upsertTelcoProviderAccount",
]), "Canonical Telco service must resolve operator accounts by provider + currency with legacy fallback and shared readiness");

const service = read("lib/enterprise/retail/service.ts");
const start = service.indexOf("export async function createTelcoTopup");
const end = service.indexOf("export async function reverseTelcoTopup", start);
const createBlock = start >= 0 && end > start ? service.slice(start, end) : "";
const reverseStart = end;
const reverseEnd = service.indexOf("export async function createRetailDailyClose", reverseStart);
const reverseBlock = reverseStart >= 0 && reverseEnd > reverseStart ? service.slice(reverseStart, reverseEnd) : "";
check(hasAll(createBlock, ["resolveTelcoFloatAccountTx(tx, organizationId, provider, tenderAccount.currencyCode)", "tenderFinancialAccountId", "operatorFloatAccountId: operatorFloatAccount.id", "RETAIL_CURRENCY_MISMATCH"]), "New top-ups must resolve the operator account from the actual tender currency and protect Catalog currency");
check(!createBlock.includes("input.operatorFloatAccountId || provider.telcoFloatAccountId"), "Browser and legacy single-account fields must not select the new Telco operator account");
check(hasAll(reverseBlock, ["topup.tenderFinancialAccountId", "topup.operatorFloatAccountId", "topup.currencyCode"]), "Telco reversal must keep using the historical accounts stored on the original top-up");

const orchestration = read("lib/enterprise/retail/operator-orchestration.ts");
check(hasAll(orchestration, ["createConnectedTelcoTopupOperation", "PENDING_TELCO_TOPUP", "createTelcoTopup(organizationId, operation.createdByUserId, parsed.data)"]), "Connected Telco confirmation must converge on the same server-authoritative top-up service");

const accountRoute = read("app/api/enterprise/[organizationId]/retail/telco-topups/accounts/route.ts");
check(hasAll(accountRoute, ['"TELCO_TOPUPS", "read"', '"TELCO_TOPUPS", "manage"', "telcoProviderAccountUpsertSchema", "upsertTelcoProviderAccount"]), "Telco account mapping API must enforce read/manage RBAC and validation");

const closeRoute = read("app/api/enterprise/[organizationId]/retail/telco-topups/cash-sessions/[sessionId]/close/route.ts");
check(hasAll(closeRoute, ['"TELCO_TOPUPS", "submit"', "cashCloseSchema", "submitCashSessionClose", 'moduleCode: "TELCO_TOPUPS"']), "Telco cash close must reuse the canonical Finance close under Telco RBAC");

const dashboard = read("lib/enterprise/retail/commercial-dashboard.ts");
check(hasAll(dashboard, ["getTelcoProviderAccountConfiguration", "telcoConfiguration", "allTelcoProvidersReady", "readyForTelco: canonicalReadiness.ready && allTelcoProvidersReady", "cashSessions"]), "Telco dashboard must expose multi-currency configuration, concurrent tills and readiness");

const cashManager = read("components/enterprise/professional/mobile-money-cash-session-manager.tsx");
check(hasAll(cashManager, [
  'moduleCode?: "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS"',
  'moduleCode === "TELCO_TOPUPS"',
  "My Telco tills",
  "Mes caisses Télécom",
  'aria-pressed={selected}',
  "CDF + USD",
  "DENOMINATIONS",
  "/retail/telco-topups/cash-sessions/",
  "PENDING_VALIDATION",
]), "Telco must reuse the professional concurrent CDF/USD till selector and counted close workflow");

const sharedWorkspace = read("components/enterprise/professional/retail-workspace-shared.tsx");
check(sharedWorkspace.includes('moduleCode === "RETAIL_POS" ? <CashSessionBar'), "Operator modules must not show the conflicting legacy single-till banner");

const workspace = read("components/enterprise/professional/retail-operator-workspace.tsx");
check(hasAll(workspace, [
  "TelcoDashboard",
  "telcoConfiguration",
  "RetailMultiCashSessionManager",
  'moduleCode="TELCO_TOPUPS"',
  "selectedCashSessionId",
  "eligibleProviders",
  "nonCashAccountId",
  "operatorFloatAccountId: null",
  "selectedOperatorAccount",
  "Compte opérateur Télécom par devise",
  "Telecom operator accounts by currency",
  "/retail/telco-topups/accounts",
  "focus",
]), "Telco UX must expose concurrent tills, payment-derived currency, per-currency operator mappings and a confirmation of the resolved accounts");
check(!workspace.includes("input.operatorFloatAccountId"), "Telco UI must not become an authority for operator account selection");

const http = read("lib/enterprise/retail/http.ts");
check(http.includes("RETAIL_TELCO_CURRENCY_ACCOUNT_REQUIRED"), "Missing Telco currency-specific actionable error");

const docs = read("docs/ERP_RETAIL_TELCO_MOBILE_MONEY.md");
check(hasAll(docs, ["TELCO_FLOAT", "CDF + USD", "compte d’encaissement", "operatorFloatAccountId", "Mobile Money ou Télécom"]), "Retail documentation must describe Telco multi-currency mappings, tender-derived currency and historical reversal");

const guides = read("lib/user-guides/retail-telco-mobile-money-guides.ts");
check(hasAll(guides, ["Comptes opérateur CDF/USD par réseau", "CDF/USD operator accounts per network", "Plusieurs caisses CDF/USD simultanées", "Concurrent CDF/USD cash tills"]), "Telco FR/EN guide must explain multi-currency operator accounts and tills");

check(!fs.existsSync(path.join(root, ".github/workflows/tmp-310-telco-multicurrency.yml")), "Temporary #310 workflow must not remain in the branch");
check(!fs.existsSync(path.join(root, "scripts/tmp-310-telco-multicurrency-codemod.mjs")), "Temporary #310 codemod must not remain in the branch");

if (failures.length) {
  console.error("Issue #310 Telco multi-currency QA failed:\n" + failures.map((failure) => "- " + failure).join("\n"));
  process.exit(1);
}
console.log("Issue #310 Telco multi-currency QA passed: operator/currency mappings, CDF/USD readiness, server-side account resolution, concurrent tills, non-cash tender currencies, safe reversal, RBAC and FR/EN UX are guarded.");
`));

replaceOnce(
  "scripts/run-regression-qa-ci.mjs",
  'commands.unshift("node scripts/qa-307-mobile-money-multicurrency.mjs");',
  'commands.unshift("node scripts/qa-307-mobile-money-multicurrency.mjs");\ncommands.unshift("node scripts/qa-310-telco-multicurrency.mjs");',
);

// Extend the existing Retail contract with the new API route and dashboard semantics without weakening prior checks.
replaceOnce(
  "scripts/qa-retail-telco-mobile-money.mjs",
  '  "app/api/enterprise/[organizationId]/retail/telco-topups/route.ts",',
  '  "app/api/enterprise/[organizationId]/retail/telco-topups/route.ts",\n  "app/api/enterprise/[organizationId]/retail/telco-topups/accounts/route.ts",\n  "app/api/enterprise/[organizationId]/retail/telco-topups/cash-sessions/[sessionId]/close/route.ts",',
);
replaceOnce(
  "scripts/qa-retail-telco-mobile-money.mjs",
  'for (const marker of ["metricsByCurrency", "readyForFirstSale", "readyForMobileMoney", "readyForTelco", "cashSession", "includePos", "includeMobileMoney", "includeTelco", "includeClose", "accountingReadiness", \'code: "ACCOUNTING"\']) {',
  'for (const marker of ["metricsByCurrency", "readyForFirstSale", "readyForMobileMoney", "readyForTelco", "cashSession", "cashSessions", "telcoConfiguration", "includePos", "includeMobileMoney", "includeTelco", "includeClose", "accountingReadiness", \'code: "ACCOUNTING"\']) {',
);

// Remove temporary delivery machinery before committing the generated result.
fs.rmSync(p(".github/workflows/tmp-310-telco-multicurrency.yml"), { force: true });
fs.rmSync(p("scripts/tmp-310-telco-multicurrency-codemod.mjs"), { force: true });

// Fast structural self-check before the workflow creates the commit.
const serviceAfter = read("lib/enterprise/retail/service.ts");
ensure(serviceAfter, "resolveTelcoFloatAccountTx(tx, organizationId, provider, tenderAccount.currencyCode)", "server-side Telco resolver");
ensure(read("lib/enterprise/retail/commercial-dashboard.ts"), "allTelcoProvidersReady", "Telco readiness");
ensure(read("components/enterprise/professional/retail-operator-workspace.tsx"), "Telecom operator accounts by currency", "Telco multi-currency UI");
ensure(read("scripts/qa-310-telco-multicurrency.mjs"), "Issue #310 Telco multi-currency QA passed", "targeted QA");
