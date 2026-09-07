import { Prisma, type PrismaClient } from "@prisma/client";

export type AccountingQueryFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  fiscalPeriodId?: string | null;
  ledgerAccountId?: string | null;
  journalId?: string | null;
  businessPartyId?: string | null;
  projectId?: string | null;
  departmentId?: string | null;
  siteId?: string | null;
  assetId?: string | null;
  inventoryItemId?: string | null;
  sourceModule?: string | null;
  sourceEntityType?: string | null;
  currencyCode?: string | null;
  status?: string | null;
};

type AccountingQueryDb = Pick<
  PrismaClient,
  | "enterpriseFinanceConfiguration"
  | "enterpriseFiscalPeriod"
  | "enterpriseJournalEntry"
  | "enterpriseJournalLine"
  | "enterpriseLedgerAccount"
  | "enterprisePostingBatch"
>;

const MAX_PAGE_SIZE = 100;

function pageValues(filters: AccountingQueryFilters) {
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize || 25));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function dateFilter(filters: AccountingQueryFilters): Prisma.DateTimeFilter | undefined {
  if (!filters.dateFrom && !filters.dateTo) return undefined;
  return {
    ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
    ...(filters.dateTo ? { lte: filters.dateTo } : {}),
  };
}

function postedEntryWhere(filters: AccountingQueryFilters): Prisma.EnterpriseJournalEntryWhereInput {
  return {
    status: "POSTED",
    ...(dateFilter(filters) ? { accountingDate: dateFilter(filters) } : {}),
    ...(filters.fiscalPeriodId ? { fiscalPeriodId: filters.fiscalPeriodId } : {}),
    ...(filters.journalId ? { journalId: filters.journalId } : {}),
    ...(filters.sourceModule ? { sourceModule: filters.sourceModule } : {}),
    ...(filters.sourceEntityType ? { sourceEntityType: filters.sourceEntityType } : {}),
    ...(filters.currencyCode ? { functionalCurrencyCode: filters.currencyCode } : {}),
  };
}

function dimensionLineWhere(filters: AccountingQueryFilters): Prisma.EnterpriseJournalLineWhereInput {
  return {
    ...(filters.ledgerAccountId ? { ledgerAccountId: filters.ledgerAccountId } : {}),
    ...(filters.businessPartyId ? { businessPartyId: filters.businessPartyId } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.siteId ? { siteId: filters.siteId } : {}),
    ...(filters.assetId ? { assetId: filters.assetId } : {}),
    ...(filters.inventoryItemId ? { inventoryItemId: filters.inventoryItemId } : {}),
  };
}

export async function getAccountingGeneralLedger(
  db: AccountingQueryDb,
  organizationId: string,
  filters: AccountingQueryFilters = {},
) {
  const { page, pageSize, skip } = pageValues(filters);
  const search = filters.search?.trim() || "";
  const where: Prisma.EnterpriseJournalLineWhereInput = {
    organizationId,
    ...dimensionLineWhere(filters),
    journalEntry: { organizationId, ...postedEntryWhere(filters) },
    ...(search
      ? {
          OR: [
            { description: { contains: search, mode: "insensitive" } },
            { ledgerAccount: { code: { contains: search, mode: "insensitive" } } },
            { ledgerAccount: { nameFr: { contains: search, mode: "insensitive" } } },
            { ledgerAccount: { nameEn: { contains: search, mode: "insensitive" } } },
            { journalEntry: { number: { contains: search, mode: "insensitive" } } },
            { journalEntry: { reference: { contains: search, mode: "insensitive" } } },
            { journalEntry: { description: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.enterpriseJournalLine.findMany({
      where,
      orderBy: [
        { journalEntry: { accountingDate: "desc" } },
        { journalEntry: { number: "desc" } },
        { createdAt: "asc" },
      ],
      skip,
      take: pageSize,
      select: {
        id: true,
        ledgerAccountId: true,
        businessPartyId: true,
        projectId: true,
        departmentId: true,
        siteId: true,
        assetId: true,
        inventoryItemId: true,
        description: true,
        debit: true,
        credit: true,
        transactionCurrencyCode: true,
        transactionAmount: true,
        exchangeRate: true,
        functionalAmount: true,
        analyticReference: true,
        ledgerAccount: { select: { code: true, nameFr: true, nameEn: true, accountType: true } },
        journalEntry: {
          select: {
            id: true,
            number: true,
            accountingDate: true,
            documentDate: true,
            reference: true,
            description: true,
            sourceModule: true,
            sourceEntityType: true,
            sourceEntityId: true,
            postingEvent: true,
            functionalCurrencyCode: true,
            status: true,
            journal: { select: { code: true, nameFr: true, nameEn: true, journalType: true } },
            fiscalPeriod: { select: { id: true, code: true } },
          },
        },
      },
    }),
    db.enterpriseJournalLine.count({ where }),
  ]);

  return {
    items: rows,
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export async function getAccountingTrialBalance(
  db: AccountingQueryDb,
  organizationId: string,
  filters: AccountingQueryFilters = {},
) {
  const { page, pageSize } = pageValues(filters);
  const search = filters.search?.trim() || "";
  const requestedPeriod = filters.fiscalPeriodId
    ? await db.enterpriseFiscalPeriod.findFirst({
        where: { organizationId, id: filters.fiscalPeriodId },
        select: { id: true, startDate: true, endDate: true },
      })
    : null;

  if (filters.fiscalPeriodId && !requestedPeriod) {
    return {
      items: [],
      period: { dateFrom: filters.dateFrom || null, dateTo: filters.dateTo || null },
      functionalCurrencyCode: filters.currencyCode || null,
      pagination: { page, pageSize, total: 0, pageCount: 1 },
    };
  }

  const dateFrom = filters.dateFrom || requestedPeriod?.startDate || null;
  const dateTo = filters.dateTo || requestedPeriod?.endDate || null;
  const sharedEntryWhere: Prisma.EnterpriseJournalEntryWhereInput = {
    organizationId,
    status: "POSTED",
    ...(filters.journalId ? { journalId: filters.journalId } : {}),
    ...(filters.sourceModule ? { sourceModule: filters.sourceModule } : {}),
    ...(filters.sourceEntityType ? { sourceEntityType: filters.sourceEntityType } : {}),
    ...(filters.currencyCode ? { functionalCurrencyCode: filters.currencyCode } : {}),
  };
  const lineDimensions = dimensionLineWhere(filters);

  const openingWhere: Prisma.EnterpriseJournalLineWhereInput = {
    organizationId,
    ...lineDimensions,
    journalEntry: {
      ...sharedEntryWhere,
      ...(dateFrom ? { accountingDate: { lt: dateFrom } } : { accountingDate: { lt: new Date(0) } }),
    },
  };

  const movementWhere: Prisma.EnterpriseJournalLineWhereInput = {
    organizationId,
    ...lineDimensions,
    journalEntry: {
      ...sharedEntryWhere,
      ...(filters.fiscalPeriodId ? { fiscalPeriodId: filters.fiscalPeriodId } : {}),
      ...((dateFrom || dateTo)
        ? {
            accountingDate: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
    },
  };

  const [opening, movement, configuration] = await Promise.all([
    dateFrom
      ? db.enterpriseJournalLine.groupBy({
          by: ["ledgerAccountId"],
          where: openingWhere,
          _sum: { debit: true, credit: true },
        })
      : Promise.resolve([]),
    db.enterpriseJournalLine.groupBy({
      by: ["ledgerAccountId"],
      where: movementWhere,
      _sum: { debit: true, credit: true },
    }),
    db.enterpriseFinanceConfiguration.findUnique({
      where: { organizationId },
      select: { functionalCurrencyCode: true },
    }),
  ]);

  const accountIds = [...new Set([...opening, ...movement].map((row) => row.ledgerAccountId))];
  const accounts = accountIds.length
    ? await db.enterpriseLedgerAccount.findMany({
        where: {
          organizationId,
          id: { in: accountIds },
          ...(search
            ? {
                OR: [
                  { code: { contains: search, mode: "insensitive" } },
                  { nameFr: { contains: search, mode: "insensitive" } },
                  { nameEn: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: { id: true, code: true, nameFr: true, nameEn: true, accountType: true, accountSubtype: true, isActive: true },
        orderBy: { code: "asc" },
      })
    : [];

  const openingByAccount = new Map(opening.map((row) => [row.ledgerAccountId, row]));
  const movementByAccount = new Map(movement.map((row) => [row.ledgerAccountId, row]));
  const rows = accounts.map((account) => {
    const openingRow = openingByAccount.get(account.id);
    const movementRow = movementByAccount.get(account.id);
    const openingDebit = new Prisma.Decimal(openingRow?._sum.debit || 0);
    const openingCredit = new Prisma.Decimal(openingRow?._sum.credit || 0);
    const periodDebit = new Prisma.Decimal(movementRow?._sum.debit || 0);
    const periodCredit = new Prisma.Decimal(movementRow?._sum.credit || 0);
    const openingBalance = openingDebit.minus(openingCredit);
    const closingBalance = openingBalance.plus(periodDebit).minus(periodCredit);
    return {
      ...account,
      functionalCurrencyCode: configuration?.functionalCurrencyCode || filters.currencyCode || null,
      openingDebit,
      openingCredit,
      openingBalance,
      periodDebit,
      periodCredit,
      closingBalance,
    };
  });

  const total = rows.length;
  const offset = (page - 1) * pageSize;
  return {
    items: rows.slice(offset, offset + pageSize),
    period: { dateFrom, dateTo },
    functionalCurrencyCode: configuration?.functionalCurrencyCode || filters.currencyCode || null,
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export async function getAccountingEntryTrace(
  db: AccountingQueryDb,
  organizationId: string,
  entryId: string,
) {
  return db.enterpriseJournalEntry.findFirst({
    where: { organizationId, id: entryId },
    select: {
      id: true,
      number: true,
      accountingDate: true,
      documentDate: true,
      reference: true,
      description: true,
      sourceModule: true,
      sourceEntityType: true,
      sourceEntityId: true,
      postingEvent: true,
      postingVersion: true,
      status: true,
      totalDebit: true,
      totalCredit: true,
      functionalCurrencyCode: true,
      preparedByUserId: true,
      approvedByUserId: true,
      postedByUserId: true,
      postedAt: true,
      reversedAt: true,
      reversalOfEntryId: true,
      journal: { select: { code: true, nameFr: true, nameEn: true, journalType: true } },
      fiscalPeriod: { select: { id: true, code: true, startDate: true, endDate: true, status: true } },
      lines: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          ledgerAccountId: true,
          businessPartyId: true,
          projectId: true,
          departmentId: true,
          siteId: true,
          assetId: true,
          inventoryItemId: true,
          description: true,
          debit: true,
          credit: true,
          transactionCurrencyCode: true,
          transactionAmount: true,
          exchangeRate: true,
          functionalAmount: true,
          analyticReference: true,
          ledgerAccount: { select: { code: true, nameFr: true, nameEn: true, accountType: true } },
        },
      },
    },
  });
}

export async function getAccountingAnomalies(
  db: AccountingQueryDb,
  organizationId: string,
  filters: AccountingQueryFilters = {},
) {
  const { page, pageSize, skip } = pageValues(filters);
  const search = filters.search?.trim() || "";
  const where: Prisma.EnterprisePostingBatchWhereInput = {
    organizationId,
    status: filters.status || "FAILED",
    ...(dateFilter(filters) ? { createdAt: dateFilter(filters) } : {}),
    ...(search
      ? {
          OR: [
            { reference: { contains: search, mode: "insensitive" } },
            { sourceEntityType: { contains: search, mode: "insensitive" } },
            { errorCode: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.enterprisePostingBatch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        reference: true,
        postingEvent: true,
        sourceEntityType: true,
        sourceEntityId: true,
        status: true,
        errorCode: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.enterprisePostingBatch.count({ where }),
  ]);
  return { items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } };
}
