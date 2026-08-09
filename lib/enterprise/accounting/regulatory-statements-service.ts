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
      messageFr: "Aucun template comptable versionné actif ne permet de produire un état réglementaire.",
      messageEn: "No active versioned accounting template can produce a regulatory statement.",
      templateReference: null,
      statementTypes: [] as string[],
    };
  }
  const template = getChartTemplate(chart.templateCode);
  if (!template) {
    return {
      supported: false,
      reasonCode: "REGULATORY_TEMPLATE_LINEAGE_UNKNOWN",
      messageFr: "La version source du plan comptable actif n'est plus disponible dans le registre.",
      messageEn: "The active chart source version is no longer available in the registry.",
      templateReference: chart.templateCode,
      statementTypes: [] as string[],
    };
  }
  const statementTypes = Array.from(new Set(template.financialStatementMappings.map((mapping) => mapping.statementType)));
  if (!statementTypes.length) {
    return {
      supported: false,
      reasonCode: "REGULATORY_STATEMENT_MAPPING_NOT_VALIDATED",
      messageFr: "Ce template ne contient aucune rubrique réglementaire validée. Les états de gestion restent disponibles, mais aucun état ne doit être présenté comme conforme au référentiel.",
      messageEn: "This template contains no validated regulatory statement mapping. Management reports remain available, but no statement may be presented as framework-compliant.",
      templateReference: chart.templateCode,
      statementTypes,
    };
  }
  return {
    supported: true,
    reasonCode: null,
    messageFr: "Des rubriques réglementaires versionnées sont disponibles pour ce template.",
    messageEn: "Versioned regulatory statement mappings are available for this template.",
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
    throw new EnterpriseAccountingError(support.reasonCode || "REGULATORY_STATEMENT_NOT_SUPPORTED", 409, {
      templateReference: support.templateReference,
    });
  }
  const template = getChartTemplate(support.templateReference);
  if (!template) throw new EnterpriseAccountingError("REGULATORY_TEMPLATE_LINEAGE_UNKNOWN", 409);
  const mappings = template.financialStatementMappings.filter((mapping) => mapping.statementType === input.statementType);
  if (!mappings.length) throw new EnterpriseAccountingError("REGULATORY_STATEMENT_TYPE_NOT_SUPPORTED", 409, { statementType: input.statementType });

  const accountCodes = Array.from(new Set(mappings.flatMap((mapping) => [...mapping.accountCodes])));
  const rows = await prisma.$queryRaw<Array<{
    accountCode: string;
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
    entryCount: bigint;
  }>>(Prisma.sql`
    SELECT a.code AS "accountCode",
      COALESCE(SUM(l.debit), 0) AS debit,
      COALESCE(SUM(l.credit), 0) AS credit,
      COUNT(DISTINCT e.id)::bigint AS "entryCount"
    FROM "EnterpriseLedgerAccount" a
    JOIN "EnterpriseJournalLine" l
      ON l."ledgerAccountId" = a.id
      AND l."organizationId" = a."organizationId"
    JOIN "EnterpriseJournalEntry" e
      ON e.id = l."journalEntryId"
      AND e."organizationId" = l."organizationId"
      AND e.status = 'POSTED'
      AND e."accountingDate" BETWEEN ${input.periodStart} AND ${input.periodEnd}
    WHERE a."organizationId" = ${organizationId}
      AND a.code IN (${Prisma.join(accountCodes)})
    GROUP BY a.code
  `);
  const balanceByCode = new Map(rows.map((row) => [row.accountCode, row]));
  const lines = mappings.sort((a, b) => a.sortOrder - b.sortOrder).map((mapping) => {
    const contributors = mapping.accountCodes.map((accountCode) => {
      const row = balanceByCode.get(accountCode);
      const debit = row?.debit || new Prisma.Decimal(0);
      const credit = row?.credit || new Prisma.Decimal(0);
      return { accountCode, debit, credit, netDebit: debit.minus(credit), entryCount: row ? Number(row.entryCount) : 0 };
    });
    const amount = contributors.reduce((total, contributor) => total.plus(contributor.netDebit), new Prisma.Decimal(0));
    return {
      lineCode: mapping.lineCode,
      nameFr: mapping.nameFr,
      nameEn: mapping.nameEn,
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
