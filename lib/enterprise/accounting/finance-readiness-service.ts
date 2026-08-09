import { Prisma } from "@prisma/client";
import { getChartTemplate } from "@/lib/enterprise/accounting/chart-template-registry";
import { requiredJournalTypes } from "@/lib/enterprise/accounting/journal-template-registry";
import { listRequiredPostingSemanticKeys, validateTemplateSemanticCoverage } from "@/lib/enterprise/accounting/semantic-account-registry";
import { prisma } from "@/lib/prisma";

export type FinanceReadinessMode = "SETUP" | "POSTING";
export type FinanceReadinessSeverity = "BLOCKER" | "WARNING";

export type FinanceReadinessDiagnostic = {
  code: string;
  severity: FinanceReadinessSeverity;
  ready: boolean;
  messageFr: string;
  messageEn: string;
  actionFr?: string;
  actionEn?: string;
};

export type EnterpriseFinanceReadiness = {
  version: 1;
  mode: FinanceReadinessMode;
  organizationId: string;
  asOf: string;
  configuration: Prisma.EnterpriseFinanceConfigurationGetPayload<Record<string, never>> | null;
  chart: Prisma.EnterpriseChartOfAccountsGetPayload<Record<string, never>> | null;
  templateReference: string | null;
  diagnostics: FinanceReadinessDiagnostic[];
  blockers: FinanceReadinessDiagnostic[];
  warnings: FinanceReadinessDiagnostic[];
  missingMappings: string[];
  missingJournalTypes: string[];
  ready: boolean;
};

type ReadinessClient = Prisma.TransactionClient | typeof prisma;

type ResolveFinanceReadinessOptions = {
  chartId?: string | null;
  mode?: FinanceReadinessMode;
  asOf?: Date;
};

async function resolveChart(
  db: ReadinessClient,
  organizationId: string,
  chartId: string | null | undefined,
  mode: FinanceReadinessMode,
) {
  if (chartId) {
    return db.enterpriseChartOfAccounts.findFirst({ where: { id: chartId, organizationId } });
  }
  if (mode === "POSTING") {
    return db.enterpriseChartOfAccounts.findFirst({
      where: { organizationId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
    });
  }
  const active = await db.enterpriseChartOfAccounts.findFirst({
    where: { organizationId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });
  if (active) return active;
  return db.enterpriseChartOfAccounts.findFirst({
    where: { organizationId, status: { in: ["DRAFT", "READY"] } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function resolveEnterpriseFinanceReadiness(
  db: ReadinessClient,
  organizationId: string,
  options: ResolveFinanceReadinessOptions = {},
): Promise<EnterpriseFinanceReadiness> {
  const mode = options.mode || "SETUP";
  const asOf = options.asOf || new Date();
  const chart = await resolveChart(db, organizationId, options.chartId, mode);
  const chartId = chart?.id || null;
  const template = chart?.templateCode ? getChartTemplate(chart.templateCode) : undefined;
  const requiredMappingKeys = [...listRequiredPostingSemanticKeys()];
  const requiredJournals = [...requiredJournalTypes()];

  const [configuration, accounts, mappings, journals, fiscalYearCount, openPeriodCount, treasuryCount, taxCount] = await Promise.all([
    db.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } }),
    chartId
      ? db.enterpriseLedgerAccount.findMany({
          where: { organizationId, chartId, isActive: true, archivedAt: null },
          select: { id: true },
        })
      : Promise.resolve([]),
    chartId
      ? db.enterpriseAccountMapping.findMany({
          where: {
            organizationId,
            mappingKey: { in: requiredMappingKeys },
            isActive: true,
            OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asOf } }],
            AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }] }],
          },
          include: { ledgerAccount: { select: { chartId: true, isActive: true, archivedAt: true } } },
        })
      : Promise.resolve([]),
    db.enterpriseJournal.findMany({ where: { organizationId, isActive: true }, select: { journalType: true } }),
    db.enterpriseFiscalYear.count({ where: { organizationId } }),
    db.enterpriseFiscalPeriod.count({ where: { organizationId, status: "OPEN" } }),
    db.enterpriseFinancialAccount.count({ where: { organizationId, status: "ACTIVE", archivedAt: null } }),
    db.enterpriseTaxCode.count({ where: { organizationId, isActive: true } }),
  ]);

  const mappedKeys = new Set(
    mappings
      .filter((mapping) => mapping.ledgerAccount.chartId === chartId && mapping.ledgerAccount.isActive && !mapping.ledgerAccount.archivedAt)
      .map((mapping) => mapping.mappingKey),
  );
  const missingMappings = requiredMappingKeys.filter((key) => !mappedKeys.has(key));
  const configuredJournalTypes = new Set(journals.map((journal) => journal.journalType));
  const missingJournalTypes = requiredJournals.filter((type) => !configuredJournalTypes.has(type));
  const templateCoverage = template ? validateTemplateSemanticCoverage(template) : { valid: false, issues: ["CHART_TEMPLATE_REFERENCE_REQUIRED"] };

  const diagnostics: FinanceReadinessDiagnostic[] = [
    {
      code: "FUNCTIONAL_CURRENCY_REQUIRED",
      severity: "BLOCKER",
      ready: Boolean(configuration?.functionalCurrencyCode),
      messageFr: "La devise fonctionnelle doit être configurée.",
      messageEn: "Functional currency must be configured.",
      actionFr: "Configurer la devise fonctionnelle dans Finance.",
      actionEn: "Configure the functional currency in Finance.",
    },
    {
      code: "FISCAL_YEAR_REQUIRED",
      severity: "BLOCKER",
      ready: fiscalYearCount > 0,
      messageFr: "Un exercice financier doit être configuré.",
      messageEn: "A fiscal year must be configured.",
      actionFr: "Créer l’exercice financier correspondant à votre calendrier comptable.",
      actionEn: "Create the fiscal year matching your accounting calendar.",
    },
    {
      code: "OPEN_FISCAL_PERIOD_REQUIRED",
      severity: "BLOCKER",
      ready: openPeriodCount > 0,
      messageFr: "Au moins une période comptable ouverte est requise.",
      messageEn: "At least one open accounting period is required.",
      actionFr: "Créer ou ouvrir une période comptable.",
      actionEn: "Create or open an accounting period.",
    },
    {
      code: "CHART_REQUIRED",
      severity: "BLOCKER",
      ready: Boolean(chart),
      messageFr: "Un plan comptable doit être sélectionné.",
      messageEn: "A chart of accounts must be selected.",
      actionFr: "Créer un plan comptable puis adopter un template versionné.",
      actionEn: "Create a chart of accounts and adopt a versioned template.",
    },
    ...(mode === "POSTING"
      ? [{
          code: "ACTIVE_CHART_REQUIRED",
          severity: "BLOCKER" as const,
          ready: chart?.status === "ACTIVE",
          messageFr: "Le plan comptable doit être activé avant toute comptabilisation.",
          messageEn: "The chart of accounts must be active before posting.",
          actionFr: "Finaliser la préparation puis activer le plan comptable.",
          actionEn: "Complete setup and activate the chart of accounts.",
        }]
      : []),
    {
      code: "CHART_ACCOUNTS_REQUIRED",
      severity: "BLOCKER",
      ready: accounts.length > 0,
      messageFr: "Le plan comptable ne contient aucun compte actif.",
      messageEn: "The chart of accounts has no active account.",
      actionFr: "Adopter un template ou créer les sous-comptes autorisés.",
      actionEn: "Adopt a template or create allowed child accounts.",
    },
    {
      code: "TEMPLATE_LINEAGE_REQUIRED",
      severity: "BLOCKER",
      ready: Boolean(template),
      messageFr: "La version source du plan comptable doit être traçable.",
      messageEn: "The chart source version must be traceable.",
      actionFr: "Adopter explicitement un template versionné.",
      actionEn: "Explicitly adopt a versioned template.",
    },
    {
      code: "TEMPLATE_SEMANTIC_COVERAGE_REQUIRED",
      severity: "BLOCKER",
      ready: templateCoverage.valid,
      messageFr: "Le template ne couvre pas tous les mappings comptables obligatoires.",
      messageEn: "The template does not cover every required accounting mapping.",
      actionFr: "Compléter les mappings recommandés avant activation.",
      actionEn: "Complete recommended mappings before activation.",
    },
    {
      code: "ORGANIZATION_MAPPINGS_REQUIRED",
      severity: "BLOCKER",
      ready: missingMappings.length === 0,
      messageFr: missingMappings.length ? `Mappings manquants : ${missingMappings.join(", ")}.` : "Tous les mappings obligatoires sont configurés.",
      messageEn: missingMappings.length ? `Missing mappings: ${missingMappings.join(", ")}.` : "All required mappings are configured.",
      actionFr: "Associer chaque clé métier à un compte actif du plan.",
      actionEn: "Map every business key to an active chart account.",
    },
    {
      code: "JOURNALS_REQUIRED",
      severity: "BLOCKER",
      ready: missingJournalTypes.length === 0,
      messageFr: missingJournalTypes.length ? `Types de journaux manquants : ${missingJournalTypes.join(", ")}.` : "Les journaux requis sont disponibles.",
      messageEn: missingJournalTypes.length ? `Missing journal types: ${missingJournalTypes.join(", ")}.` : "Required journals are available.",
      actionFr: "Installer ou configurer les journaux recommandés.",
      actionEn: "Install or configure the recommended journals.",
    },
    {
      code: "TREASURY_ACCOUNT_RECOMMENDED",
      severity: "WARNING",
      ready: treasuryCount > 0,
      messageFr: "Aucun compte financier actif n’est configuré.",
      messageEn: "No active financial account is configured.",
      actionFr: "Configurer caisse, banque ou Mobile Money avant les encaissements/décaissements.",
      actionEn: "Configure cash, bank or Mobile Money before collections/disbursements.",
    },
    {
      code: "TAX_CONFIGURATION_CONTEXTUAL",
      severity: "WARNING",
      ready: taxCount > 0,
      messageFr: "Aucun code fiscal actif n’est configuré ; cela peut être acceptable si aucune taxe ne s’applique.",
      messageEn: "No active tax code is configured; this may be acceptable when no tax applies.",
    },
  ];

  const blockers = diagnostics.filter((diagnostic) => diagnostic.severity === "BLOCKER" && !diagnostic.ready);
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "WARNING" && !diagnostic.ready);
  return {
    version: 1,
    mode,
    organizationId,
    asOf: asOf.toISOString(),
    configuration,
    chart,
    templateReference: chart?.templateCode || null,
    diagnostics,
    blockers,
    warnings,
    missingMappings,
    missingJournalTypes,
    ready: blockers.length === 0,
  };
}

export async function getEnterpriseFinanceReadiness(
  organizationId: string,
  options: ResolveFinanceReadinessOptions = {},
) {
  return resolveEnterpriseFinanceReadiness(prisma, organizationId, options);
}
