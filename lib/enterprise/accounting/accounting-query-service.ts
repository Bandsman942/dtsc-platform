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
  | "enterpriseInventoryItem"
  | "enterpriseLedgerAccount"
  | "enterprisePostingBatch"
  | "$queryRaw"
>;

// Only replace exactly recognized machine-generated legacy stock narratives.
const legacyInventoryNarrativeKinds = ["ISSUE", "RECEIPT", "LOSS", "SUPPLIER_RETURN", "CUSTODY_RECOVERY"];
type InventoryNarrativeLine = { inventoryItemId: string | null; description: string | null };
async function enrichInventoryNarratives<T extends InventoryNarrativeLine>(
  db: AccountingQueryDb, organizationId: string, rows: T[],
): Promise<Array<T & { displayDescription: string | null }>> {
  const legacyKind = (row: T) => {
    if (!row.inventoryItemId || !row.description) return null;
    return legacyInventoryNarrativeKinds.find(
      (kind) => row.description === `${kind} ${row.inventoryItemId}`,
    ) || null;
  };
  const ids = [...new Set(rows.filter(row => legacyKind(row)).map(row => row.inventoryItemId!))];
  const items = ids.length ? await db.enterpriseInventoryItem.findMany({
    where: { organizationId, id: { in: ids } },
    select: { id: true, catalogItem: { select: { name: true, code: true } } },
  }) : [];
  const byId = new Map(items.map(item => [item.id, item.catalogItem]));
  return rows.map(row => {
    const kind = legacyKind(row);
    if (!kind) return { ...row, displayDescription: row.description };
    const item = byId.get(row.inventoryItemId!);
    return { ...row, displayDescription: item
      ? `${kind} current catalog ${[item.name, item.code].filter(Boolean).join(" · ")}`
      : `${kind} catalog unavailable` };
  });
}

const MAX_PAGE_SIZE = 100;
export const LEDGER_BEARING_ENTRY_STATUSES = ["POSTED", "REVERSED"] as const;

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

const dimensions = ["ledgerAccountId", "businessPartyId", "projectId", "departmentId", "siteId", "assetId", "inventoryItemId"] as const;

function dimensionLineWhere(filters: AccountingQueryFilters): Prisma.EnterpriseJournalLineWhereInput {
  return Object.fromEntries(dimensions.flatMap(dimension => filters[dimension] ? [[dimension, filters[dimension]]] : []));
}

function ledgerSearch(search: string) {
  if (!search) return Prisma.empty;
  const contains = `%${search.replace(/[\\%_]/g, character => "\\" + character)}%`;
  const narratives = legacyInventoryNarrativeKinds.map(kind => Prisma.sql`${kind + " "} || line."inventoryItemId"`);
  return Prisma.sql`AND (
    line.description ILIKE ${contains}
    OR entry.number ILIKE ${contains}
    OR entry.reference ILIKE ${contains}
    OR entry.description ILIKE ${contains}
    OR EXISTS (
      SELECT 1 FROM "EnterpriseLedgerAccount" account
      WHERE account."organizationId" = line."organizationId" AND account.id = line."ledgerAccountId"
        AND (account.code ILIKE ${contains} OR account."nameFr" ILIKE ${contains} OR account."nameEn" ILIKE ${contains})
    )
    OR EXISTS (
      SELECT 1 FROM "EnterpriseInventoryItem" item
      JOIN "EnterpriseCatalogItem" catalog
        ON catalog."organizationId" = item."organizationId" AND catalog.id = item."catalogItemId"
      WHERE item."organizationId" = line."organizationId" AND item.id = line."inventoryItemId"
        AND line.description IN (${Prisma.join(narratives)})
        AND (catalog.name ILIKE ${contains} OR catalog.code ILIKE ${contains})
    )
  )`;
}

type LedgerSelection = {
  ids: string[];
  total: bigint;
  totals: { currencyCode: string; debit: string; credit: string }[];
};

export async function getAccountingGeneralLedger(
  db: AccountingQueryDb,
  organizationId: string,
  filters: AccountingQueryFilters = {},
) {
  const { page, pageSize, skip } = pageValues(filters);
  const dimensionFilters = dimensions.map(column => {
    const value = filters[column];
    // Identifiers come exclusively from the constant column list above.
    return value ? Prisma.sql`AND ${Prisma.raw(`line."${column}"`)} = ${value}` : Prisma.empty;
  });
  const [selection] = await db.$queryRaw<LedgerSelection[]>`
    WITH matched AS MATERIALIZED (
      SELECT line.id, line."createdAt", line.debit, line.credit, entry."accountingDate",
             entry.number, entry."functionalCurrencyCode" AS currency
      FROM "EnterpriseJournalLine" line
      JOIN "EnterpriseJournalEntry" entry
        ON entry."organizationId" = line."organizationId" AND entry.id = line."journalEntryId"
      WHERE line."organizationId" = ${organizationId}
        AND entry.status IN (${Prisma.join([...LEDGER_BEARING_ENTRY_STATUSES])})
        ${filters.status ? Prisma.sql`AND entry.status = ${filters.status}` : Prisma.empty}
        ${filters.dateFrom ? Prisma.sql`AND entry."accountingDate" >= ${filters.dateFrom}` : Prisma.empty}
        ${filters.dateTo ? Prisma.sql`AND entry."accountingDate" <= ${filters.dateTo}` : Prisma.empty}
        ${filters.fiscalPeriodId ? Prisma.sql`AND entry."fiscalPeriodId" = ${filters.fiscalPeriodId}` : Prisma.empty}
        ${filters.journalId ? Prisma.sql`AND entry."journalId" = ${filters.journalId}` : Prisma.empty}
        ${filters.sourceModule ? Prisma.sql`AND entry."sourceModule" = ${filters.sourceModule}` : Prisma.empty}
        ${filters.sourceEntityType ? Prisma.sql`AND entry."sourceEntityType" = ${filters.sourceEntityType}` : Prisma.empty}
        ${filters.currencyCode ? Prisma.sql`AND entry."functionalCurrencyCode" = ${filters.currencyCode}` : Prisma.empty}
        ${Prisma.join(dimensionFilters, " ")}
        ${ledgerSearch(filters.search?.trim() || "")}
    )
    SELECT
      (SELECT count(*) FROM matched) AS total,
      ARRAY(SELECT id FROM matched ORDER BY "accountingDate" DESC, number DESC, "createdAt", id
            LIMIT ${pageSize} OFFSET ${skip}) AS ids,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('currencyCode', currency, 'debit', debit, 'credit', credit)
                               ORDER BY currency)
        FROM (SELECT currency, sum(debit)::text AS debit, sum(credit)::text AS credit FROM matched GROUP BY currency) totals),
        '[]'::jsonb) AS totals`;
  const total = Number(selection.total);
  const rows = selection.ids.length ? await db.enterpriseJournalLine.findMany({
    where: { organizationId, id: { in: selection.ids } },
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
  }) : [];
  const descriptionsById = new Map((await enrichInventoryNarratives(db, organizationId, rows)).map(row => [row.id, row]));

  return {
    filteredTotals: selection.totals.flatMap(({ currencyCode, debit, credit }) => [
      { currencyCode, metric: "debit", amount: new Prisma.Decimal(debit).toFixed() },
      { currencyCode, metric: "credit", amount: new Prisma.Decimal(credit).toFixed() },
    ]),
    items: selection.ids.flatMap(id => {
      const row = descriptionsById.get(id);
      return row ? [row] : [];
    }),
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
    status: { in: [...LEDGER_BEARING_ENTRY_STATUSES] },
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
  const entry = await db.enterpriseJournalEntry.findFirst({
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
      revision: true,
      journal: { select: { code: true, nameFr: true, nameEn: true, journalType: true, requiresApproval: true } },
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
  if (!entry) return null;
  return { ...entry, lines: await enrichInventoryNarratives(db, organizationId, entry.lines) };
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
