import { getEnterpriseFinanceReadiness } from "@/lib/enterprise/accounting/finance-readiness-service";
import { prisma } from "@/lib/prisma";

const RETAIL_REQUIRED_ACCOUNT_MAPPINGS = ["SALES_REVENUE", "TAX_PAYABLE", "COST_OF_SALES", "INVENTORY"] as const;
const RETAIL_REQUIRED_JOURNAL_TYPES = ["SALES", "INVENTORY"] as const;

export async function getRetailAccountingReadiness(organizationId: string, at = new Date()) {
  const [financeReadiness, mappings, journals, currentPeriod] = await Promise.all([
    getEnterpriseFinanceReadiness(organizationId, { mode: "POSTING", asOf: at }),
    prisma.enterpriseAccountMapping.findMany({
      where: {
        organizationId,
        mappingKey: { in: [...RETAIL_REQUIRED_ACCOUNT_MAPPINGS] },
        isActive: true,
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: at } }],
        AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }] }],
      },
      select: { mappingKey: true, ledgerAccount: { select: { id: true, isActive: true, archivedAt: true } } },
    }),
    prisma.enterpriseJournal.findMany({
      where: { organizationId, journalType: { in: [...RETAIL_REQUIRED_JOURNAL_TYPES] }, isActive: true },
      select: { journalType: true },
    }),
    prisma.enterpriseFiscalPeriod.findFirst({
      where: {
        organizationId,
        fiscalYear: { status: "OPEN" },
        startDate: { lte: at },
        endDate: { gte: at },
        status: "OPEN",
      },
      select: { id: true, status: true, fiscalYear: { select: { id: true, status: true } } },
    }),
  ]);

  const mappingSet = new Set(
    mappings
      .filter((mapping) => mapping.ledgerAccount.isActive && !mapping.ledgerAccount.archivedAt)
      .map((mapping) => mapping.mappingKey),
  );
  const journalSet = new Set(journals.map((journal) => journal.journalType));
  const missingMappings = RETAIL_REQUIRED_ACCOUNT_MAPPINGS.filter((mappingKey) => !mappingSet.has(mappingKey));
  const missingJournals = RETAIL_REQUIRED_JOURNAL_TYPES.filter((journalType) => !journalSet.has(journalType));

  const checklist = {
    financeReady: financeReadiness.ready,
    functionalCurrencyConfigured: Boolean(financeReadiness.configuration?.functionalCurrencyCode),
    requiredMappingsConfigured: missingMappings.length === 0,
    requiredJournalsConfigured: missingJournals.length === 0,
    postingPeriodAvailable: Boolean(currentPeriod),
  };

  return {
    ready: Object.values(checklist).every(Boolean),
    checklist,
    functionalCurrencyCode: financeReadiness.configuration?.functionalCurrencyCode || null,
    missingMappings,
    missingJournals,
    fiscalPeriodStatus: currentPeriod?.status || null,
    fiscalYearStatus: currentPeriod?.fiscalYear.status || null,
    financeBlockers: financeReadiness.blockers.map((diagnostic) => diagnostic.code),
  };
}
