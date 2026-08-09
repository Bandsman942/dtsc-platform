import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { getChartTemplate } from "@/lib/enterprise/accounting/chart-template-registry";

export async function getRegulatoryStatementSupport(organizationId: string) {
  const chart = await prisma.enterpriseChartOfAccounts.findFirst({
    where: { organizationId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });
  if (!chart?.templateCode) {
    return {
      supported: false,
      reasonCode: "REGULATORY_TEMPLATE_NOT_ACTIVE",
      messageFr: "Activez un plan comptable versionné pour produire les états financiers réglementaires.",
      messageEn: "Activate a versioned chart of accounts to produce regulatory financial statements.",
      templateReference: null,
      statementTypes: [] as string[],
    };
  }
  const template = getChartTemplate(chart.templateCode);
  if (!template) {
    return {
      supported: false,
      reasonCode: "REGULATORY_TEMPLATE_LINEAGE_UNKNOWN",
      messageFr: "La version d’origine du plan actif n’est plus disponible. Sélectionnez une version publiée avant de produire les états.",
      messageEn: "The source version of the active chart is no longer available. Select a published version before producing statements.",
      templateReference: chart.templateCode,
      statementTypes: [] as string[],
    };
  }
  const statementTypes = Array.from(new Set(template.financialStatementMappings.map((mapping) => mapping.statementType)));
  if (!statementTypes.length) {
    return {
      supported: false,
      reasonCode: "REGULATORY_STATEMENT_MAPPING_NOT_VALIDATED",
      messageFr: "Cette version ne contient pas encore de rubriques d’états financiers. Les rapports de gestion restent disponibles.",
      messageEn: "This version does not yet include financial statement lines. Management reports remain available.",
      templateReference: chart.templateCode,
      statementTypes,
    };
  }
  return {
    supported: true,
    reasonCode: null,
    messageFr: "Les états financiers versionnés sont disponibles pour le plan actif.",
    messageEn: "Versioned financial statements are available for the active chart.",
    templateReference: chart.templateCode,
    statementTypes,
  };
}

export async function generateRegulatoryStatement(
  organizationId: string,
  input: { statementType: string; periodStart: Date; periodEnd: Date },
) {
  if (input.periodEnd < input.periodStart) throw new EnterpriseAccountingError("REGULATORY_STATEMENT_PERIOD_INVALID", 400);
  const support = await getRegulatoryStatementSupport(organizationId);
  if (!support.supported || !support.templateReference) {
    throw new EnterpriseAccountingError(support.reasonCode || "REGULATORY_STATEMENT_NOT_SUPPORTED", 409, { templateReference: support.templateReference });
  }
  const template = getChartTemplate(support.templateReference);
  if (!template) throw new EnterpriseAccountingError("REGULATORY_TEMPLATE_LINEAGE_UNKNOWN", 409);
  const mappings = template.financialStatementMappings.filter((mapping) => mapping.statementType === input.statementType);
  if (!mappings.length) throw new EnterpriseAccountingError("REGULATORY_STATEMENT_TYPE_NOT_SUPPORTED", 409, { statementType: input.statementType });

  const accountCodes = Array.from(new Set(mappings.flatMap((mapping) => [...mapping.accountCodes])));
  const rows = await prisma.$queryRaw<Array<{ accountCode: string; debit: Prisma.Decimal; credit: Prisma.Decimal; entryCount: bigint }>>(Prisma.sql`
    SELECT a.code AS "accountCode",
      COALESCE(SUM(l.debit), 0) AS debit,
      COALESCE(SUM(l.credit), 0) AS credit,
      COUNT(DISTINCT e.id)::bigint AS "entryCount"
    FROM "EnterpriseLedgerAccount" a
    JOIN "EnterpriseJournalLine" l ON l."ledgerAccountId" = a.id AND l."organizationId" = a."organizationId"
    JOIN "EnterpriseJournalEntry" e ON e.id = l."journalEntryId" AND e."organizationId" = l."organizationId"
      AND e.status = 'POSTED' AND e."accountingDate" BETWEEN ${input.periodStart} AND ${input.periodEnd}
    WHERE a."organizationId" = ${organizationId} AND a.code IN (${Prisma.join(accountCodes)})
    GROUP BY a.code
  `);
  const balanceByCode = new Map(rows.map((row) => [row.accountCode, row]));
  const lines = mappings.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((mapping) => {
    const contributors = mapping.accountCodes.map((accountCode) => {
      const row = balanceByCode.get(accountCode);
      const debit = row?.debit || new Prisma.Decimal(0);
      const credit = row?.credit || new Prisma.Decimal(0);
      const amount = mapping.normalBalance === "CREDIT" ? credit.minus(debit) : debit.minus(credit);
      return { accountCode, debit, credit, amount, entryCount: row ? Number(row.entryCount) : 0 };
    });
    const amount = contributors.reduce((total, contributor) => total.plus(contributor.amount), new Prisma.Decimal(0));
    return {
      lineCode: mapping.lineCode,
      nameFr: mapping.nameFr,
      nameEn: mapping.nameEn,
      normalBalance: mapping.normalBalance,
      sortOrder: mapping.sortOrder,
      amount,
      contributors,
    };
  });
  return {
    kind: "REGULATORY_STATEMENT" as const,
    frameworkCode: template.frameworkCode,
    templateReference: support.templateReference,
    statementType: input.statementType,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    lines,
    traceability: "statement line -> account codes -> posted journal entries",
  };
}
