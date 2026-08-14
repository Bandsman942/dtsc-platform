import { Prisma } from "@prisma/client";
import { getChartTemplate } from "@/lib/enterprise/accounting/chart-template-registry";
import { requiredJournalTypes } from "@/lib/enterprise/accounting/journal-template-registry";
import { listRequiredPostingSemanticKeys, validateTemplateSemanticCoverage } from "@/lib/enterprise/accounting/semantic-account-registry";
import { RETAIL_SECTOR_CODE } from "@/lib/enterprise/retail/constants";
import { prisma } from "@/lib/prisma";

export type FinanceReadinessMode = "SETUP" | "POSTING";
export type FinanceReadinessSeverity = "BLOCKER" | "WARNING";
export type FinanceReadinessActionKind = "CONFIGURATION" | "LINK" | "NONE";

export type FinanceReadinessDiagnostic = {
  code: string;
  severity: FinanceReadinessSeverity;
  ready: boolean;
  labelFr: string;
  labelEn: string;
  messageFr: string;
  messageEn: string;
  actionFr?: string;
  actionEn?: string;
  actionKind: FinanceReadinessActionKind;
  actionHref?: string;
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
  if (chartId) return db.enterpriseChartOfAccounts.findFirst({ where: { id: chartId, organizationId } });
  if (mode === "POSTING") {
    return db.enterpriseChartOfAccounts.findFirst({ where: { organizationId, status: "ACTIVE" }, orderBy: { updatedAt: "desc" } });
  }
  const active = await db.enterpriseChartOfAccounts.findFirst({ where: { organizationId, status: "ACTIVE" }, orderBy: { updatedAt: "desc" } });
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

  const [organization, configuration, accounts, mappings, journals, fiscalYearCount, openFiscalYearCount, openPeriodCount, treasuryCount, taxCount] = await Promise.all([
    db.organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { sectorCode: true } }),
    db.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } }),
    chartId
      ? db.enterpriseLedgerAccount.findMany({ where: { organizationId, chartId, isActive: true, archivedAt: null }, select: { id: true } })
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
    db.enterpriseFiscalYear.count({ where: { organizationId, status: "OPEN" } }),
    db.enterpriseFiscalPeriod.count({ where: { organizationId, status: "OPEN", fiscalYear: { status: "OPEN" } } }),
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
  const reconciliationTolerance = configuration ? Number(configuration.reconciliationTolerance) : Number.NaN;
  const retailFinanceRequired = organization?.sectorCode === RETAIL_SECTOR_CODE;

  const diagnostics: FinanceReadinessDiagnostic[] = [
    {
      code: "FUNCTIONAL_CURRENCY_REQUIRED", severity: "BLOCKER", ready: Boolean(configuration?.functionalCurrencyCode),
      labelFr: "Devise fonctionnelle", labelEn: "Functional currency",
      messageFr: "La devise fonctionnelle doit être configurée.", messageEn: "Functional currency must be configured.",
      actionFr: "Configurer la devise fonctionnelle.", actionEn: "Configure the functional currency.", actionKind: "CONFIGURATION",
    },
    {
      code: "PRESENTATION_CURRENCY_READY", severity: "WARNING", ready: Boolean(configuration?.presentationCurrencyCode || configuration?.functionalCurrencyCode),
      labelFr: "Devise de présentation", labelEn: "Presentation currency",
      messageFr: "La devise de présentation utilise la devise fonctionnelle lorsqu’aucune devise distincte n’est choisie.",
      messageEn: "Presentation currency uses the functional currency when no separate currency is selected.",
      actionFr: "Choisir une devise de présentation si nécessaire.", actionEn: "Choose a presentation currency if needed.", actionKind: "CONFIGURATION",
    },
    {
      code: "FISCAL_YEAR_REQUIRED", severity: "BLOCKER", ready: fiscalYearCount > 0,
      labelFr: "Exercice financier", labelEn: "Fiscal year",
      messageFr: "Un exercice financier doit être configuré.", messageEn: "A fiscal year must be configured.",
      actionFr: "Créer l’exercice financier correspondant à votre calendrier comptable.", actionEn: "Create the fiscal year matching your accounting calendar.",
      actionKind: "LINK", actionHref: "/enterprise-modules/FINANCE_ACCOUNTING?tab=years",
    },
    {
      code: "OPEN_FISCAL_YEAR_REQUIRED", severity: "BLOCKER", ready: openFiscalYearCount > 0,
      labelFr: "Exercice financier ouvert", labelEn: "Open fiscal year",
      messageFr: "L’exercice doit être ouvert après la création d’au moins une période comptable.", messageEn: "The fiscal year must be opened after at least one accounting period is created.",
      actionFr: "Créer une période si nécessaire, puis ouvrir l’exercice.", actionEn: "Create a period if needed, then open the fiscal year.",
      actionKind: "LINK", actionHref: "/enterprise-modules/FINANCE_ACCOUNTING?tab=years",
    },
    {
      code: "OPEN_FISCAL_PERIOD_REQUIRED", severity: "BLOCKER", ready: openPeriodCount > 0,
      labelFr: "Période comptable ouverte", labelEn: "Open accounting period",
      messageFr: "Au moins une période ouverte rattachée à un exercice ouvert est requise.", messageEn: "At least one open accounting period belonging to an open fiscal year is required.",
      actionFr: "Créer une période comptable dans l’exercice puis ouvrir l’exercice.", actionEn: "Create an accounting period in the fiscal year, then open the fiscal year.",
      actionKind: "LINK", actionHref: "/enterprise-modules/FINANCE_ACCOUNTING?tab=periods",
    },
    {
      code: "CHART_REQUIRED", severity: "BLOCKER", ready: Boolean(chart),
      labelFr: "Plan comptable", labelEn: "Chart of accounts",
      messageFr: "Un plan comptable doit être sélectionné.", messageEn: "A chart of accounts must be selected.",
      actionFr: "Créer le plan de l’entreprise puis adopter un template versionné.", actionEn: "Create the company chart and adopt a versioned template.",
      actionKind: "LINK", actionHref: "/enterprise-modules/FINANCE_ACCOUNTING?tab=charts",
    },
    ...(mode === "POSTING" ? [{
      code: "ACTIVE_CHART_REQUIRED", severity: "BLOCKER" as const, ready: chart?.status === "ACTIVE",
      labelFr: "Activation du plan", labelEn: "Chart activation",
      messageFr: "Le plan comptable doit être activé avant toute comptabilisation.", messageEn: "The chart of accounts must be active before posting.",
      actionFr: "Finaliser la préparation puis activer le plan comptable.", actionEn: "Complete setup and activate the chart of accounts.",
      actionKind: "LINK" as const, actionHref: "/enterprise-modules/FINANCE_ACCOUNTING?tab=overview",
    }] : []),
    {
      code: "CHART_ACCOUNTS_REQUIRED", severity: "BLOCKER", ready: accounts.length > 0,
      labelFr: "Comptes du plan", labelEn: "Chart accounts",
      messageFr: "Le plan comptable doit contenir des comptes actifs.", messageEn: "The chart of accounts must contain active accounts.",
      actionFr: "Adopter le template ou créer les sous-comptes autorisés.", actionEn: "Adopt the template or create allowed child accounts.",
      actionKind: "LINK", actionHref: "/enterprise-modules/FINANCE_ACCOUNTING?tab=accounts",
    },
    {
      code: "TEMPLATE_LINEAGE_REQUIRED", severity: "BLOCKER", ready: Boolean(template),
      labelFr: "Version du référentiel", labelEn: "Reference version",
      messageFr: "La version source du plan comptable doit être traçable.", messageEn: "The chart source version must be traceable.",
      actionFr: "Adopter explicitement un template versionné.", actionEn: "Explicitly adopt a versioned template.",
      actionKind: "LINK", actionHref: "/enterprise-modules/FINANCE_ACCOUNTING?tab=overview",
    },
    {
      code: "TEMPLATE_SEMANTIC_COVERAGE_REQUIRED", severity: "BLOCKER", ready: templateCoverage.valid,
      labelFr: "Couverture comptable", labelEn: "Accounting coverage",
      messageFr: "Le template doit couvrir tous les mappings comptables obligatoires.", messageEn: "The template must cover every required accounting mapping.",
      actionFr: "Compléter les mappings recommandés avant activation.", actionEn: "Complete recommended mappings before activation.",
      actionKind: "LINK", actionHref: "/enterprise-modules/FINANCE_ACCOUNTING?tab=rules",
    },
    {
      code: "ORGANIZATION_MAPPINGS_REQUIRED", severity: "BLOCKER", ready: missingMappings.length === 0,
      labelFr: "Règles de comptabilisation", labelEn: "Posting mappings",
      messageFr: missingMappings.length ? `Mappings manquants : ${missingMappings.join(", ")}.` : "Tous les mappings obligatoires sont configurés.",
      messageEn: missingMappings.length ? `Missing mappings: ${missingMappings.join(", ")}.` : "All required mappings are configured.",
      actionFr: "Associer chaque clé métier à un compte actif du plan.", actionEn: "Map every business key to an active chart account.",
      actionKind: "LINK", actionHref: "/enterprise-modules/FINANCE_ACCOUNTING?tab=rules",
    },
    {
      code: "JOURNALS_REQUIRED", severity: "BLOCKER", ready: missingJournalTypes.length === 0,
      labelFr: "Journaux comptables", labelEn: "Accounting journals",
      messageFr: missingJournalTypes.length ? `Types de journaux manquants : ${missingJournalTypes.join(", ")}.` : "Les journaux requis sont disponibles.",
      messageEn: missingJournalTypes.length ? `Missing journal types: ${missingJournalTypes.join(", ")}.` : "Required journals are available.",
      actionFr: "Installer ou configurer les journaux recommandés.", actionEn: "Install or configure the recommended journals.",
      actionKind: "LINK", actionHref: "/enterprise-modules/FINANCE_ACCOUNTING?tab=journals",
    },
    {
      code: "RECONCILIATION_TOLERANCE_READY", severity: "WARNING", ready: Number.isFinite(reconciliationTolerance) && reconciliationTolerance >= 0,
      labelFr: "Tolérance de rapprochement", labelEn: "Reconciliation tolerance",
      messageFr: "La tolérance de rapprochement doit être définie selon la politique de l’entreprise.", messageEn: "Reconciliation tolerance should match the company policy.",
      actionFr: "Vérifier la tolérance de rapprochement.", actionEn: "Review the reconciliation tolerance.", actionKind: "CONFIGURATION",
    },
    {
      code: retailFinanceRequired ? "RETAIL_FINANCIAL_ACCOUNT_REQUIRED" : "TREASURY_ACCOUNT_RECOMMENDED",
      severity: retailFinanceRequired ? "BLOCKER" : "WARNING",
      ready: treasuryCount > 0,
      labelFr: retailFinanceRequired ? "Compte d’encaissement Shop" : "Comptes financiers",
      labelEn: retailFinanceRequired ? "Shop settlement account" : "Financial accounts",
      messageFr: retailFinanceRequired
        ? "Un compte financier actif (caisse, banque, Mobile Money ou clearing) est requis pour encaisser les ventes Shop."
        : "Aucun compte financier actif n’est configuré.",
      messageEn: retailFinanceRequired
        ? "An active financial account (cash, bank, Mobile Money, or clearing) is required to collect Shop sales."
        : "No active financial account is configured.",
      actionFr: retailFinanceRequired ? "Créer le compte d’encaissement utilisé par le point de vente." : "Configurer caisse, banque ou Mobile Money avant les encaissements/décaissements.",
      actionEn: retailFinanceRequired ? "Create the settlement account used by the point of sale." : "Configure cash, bank or Mobile Money before collections/disbursements.",
      actionKind: "LINK", actionHref: "/enterprise-modules/FINANCE_TREASURY?tab=accounts",
    },
    {
      code: "TAX_CONFIGURATION_CONTEXTUAL", severity: "WARNING", ready: taxCount > 0,
      labelFr: "Fiscalité de base", labelEn: "Base tax setup",
      messageFr: "Aucun code fiscal actif n’est configuré ; cela peut être acceptable si aucune taxe ne s’applique.", messageEn: "No active tax code is configured; this may be acceptable when no tax applies.",
      actionFr: "Configurer les taxes applicables à l’entreprise.", actionEn: "Configure taxes applicable to the company.",
      actionKind: "LINK", actionHref: "/enterprise-modules/FINANCE_TAX",
    },
  ];

  const blockers = diagnostics.filter((diagnostic) => diagnostic.severity === "BLOCKER" && !diagnostic.ready);
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "WARNING" && !diagnostic.ready);
  return {
    version: 1, mode, organizationId, asOf: asOf.toISOString(), configuration, chart,
    templateReference: chart?.templateCode || null, diagnostics, blockers, warnings, missingMappings, missingJournalTypes,
    ready: blockers.length === 0,
  };
}

export async function getEnterpriseFinanceReadiness(organizationId: string, options: ResolveFinanceReadinessOptions = {}) {
  return resolveEnterpriseFinanceReadiness(prisma, organizationId, options);
}
