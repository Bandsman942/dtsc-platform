import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeListParams } from "@/lib/enterprise/accounting/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
type ProfessionalView = "overview" | "general-ledger" | "trial-balance" | "posting-rules" | "anomalies";

const VIEWS = new Set<ProfessionalView>(["overview", "general-ledger", "trial-balance", "posting-rules", "anomalies"]);
const OVERVIEW_RANGES = new Set(["30", "90", "365", "all"]);

function pageResult<T>(items: T[], page: number, pageSize: number, total: number) {
  return { items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } };
}

function overviewStartDate(range: string) {
  if (range === "all") return null;
  const days = Number(range);
  if (!Number.isFinite(days) || days <= 0) return null;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const requestedView = (url.searchParams.get("view") || "overview") as ProfessionalView;
  if (!VIEWS.has(requestedView)) return NextResponse.json({ error: "Invalid view", message: "Vue comptable inconnue." }, { status: 400 });

  const { page, pageSize, status, search } = financeListParams(req);
  let response: unknown;

  if (requestedView === "overview") {
    const requestedRange = url.searchParams.get("range") || "90";
    const range = OVERVIEW_RANGES.has(requestedRange) ? requestedRange : "90";
    const from = overviewStartDate(range);
    const entryDateFilter: Prisma.EnterpriseJournalEntryWhereInput = from ? { accountingDate: { gte: from } } : {};
    const batchDateFilter: Prisma.EnterprisePostingBatchWhereInput = from ? { createdAt: { gte: from } } : {};

    const [draftEntries, pendingApproval, postedEntries, failedPostings, openPeriods, closedPeriods, inactiveAccounts, mappings, journalActivity] = await Promise.all([
      prisma.enterpriseJournalEntry.count({ where: { organizationId, ...entryDateFilter, status: "DRAFT" } }),
      prisma.enterpriseJournalEntry.count({ where: { organizationId, ...entryDateFilter, status: "PENDING_APPROVAL" } }),
      prisma.enterpriseJournalEntry.count({ where: { organizationId, ...entryDateFilter, status: "POSTED" } }),
      prisma.enterprisePostingBatch.count({ where: { organizationId, ...batchDateFilter, status: "FAILED" } }),
      prisma.enterpriseFiscalPeriod.count({ where: { organizationId, status: { in: ["OPEN", "SOFT_CLOSED"] } } }),
      prisma.enterpriseFiscalPeriod.count({ where: { organizationId, status: { in: ["CLOSED", "LOCKED"] } } }),
      prisma.enterpriseLedgerAccount.count({ where: { organizationId, isActive: false } }),
      prisma.enterpriseAccountMapping.count({ where: { organizationId, isActive: true } }),
      prisma.enterpriseJournalEntry.groupBy({
        by: ["journalId", "functionalCurrencyCode"],
        where: { organizationId, ...entryDateFilter, status: "POSTED" },
        _count: { _all: true },
        _sum: { totalDebit: true },
        orderBy: { journalId: "asc" },
      }),
    ]);
    const journalIds = [...new Set(journalActivity.map((row) => row.journalId))];
    const journals = journalIds.length ? await prisma.enterpriseJournal.findMany({ where: { organizationId, id: { in: journalIds } }, select: { id: true, code: true, nameFr: true, nameEn: true } }) : [];
    const journalById = new Map(journals.map((journal) => [journal.id, journal]));

    response = {
      items: [],
      range,
      metrics: { draftEntries, pendingApproval, postedEntries, failedPostings, openPeriods, closedPeriods, inactiveAccounts, activePostingRules: mappings },
      charts: {
        workflow: [
          { key: "DRAFT", label: "DRAFT", value: draftEntries },
          { key: "PENDING_APPROVAL", label: "PENDING_APPROVAL", value: pendingApproval },
          { key: "POSTED", label: "POSTED", value: postedEntries },
          { key: "FAILED", label: "FAILED", value: failedPostings },
        ],
        journals: journalActivity.map((row) => {
          const journal = journalById.get(row.journalId);
          return {
            key: `${row.journalId}:${row.functionalCurrencyCode}`,
            label: `${journal?.code || "—"} · ${journal?.nameFr || journal?.nameEn || "Journal"}`,
            labelFr: `${journal?.code || "—"} · ${journal?.nameFr || journal?.nameEn || "Journal"}`,
            labelEn: `${journal?.code || "—"} · ${journal?.nameEn || journal?.nameFr || "Journal"}`,
            value: row._count._all,
            amount: (row._sum.totalDebit || new Prisma.Decimal(0)).toFixed(),
            currencyCode: row.functionalCurrencyCode,
          };
        }),
      },
      pagination: { page: 1, pageSize, total: 0, pageCount: 1 },
    };
  } else if (requestedView === "general-ledger") {
    const where: Prisma.EnterpriseJournalLineWhereInput = {
      organizationId,
      journalEntry: { organizationId, status: status || "POSTED" },
      ...(search ? { OR: [
        { ledgerAccount: { code: { contains: search, mode: "insensitive" } } },
        { ledgerAccount: { nameFr: { contains: search, mode: "insensitive" } } },
        { ledgerAccount: { nameEn: { contains: search, mode: "insensitive" } } },
        { description: { contains: search, mode: "insensitive" } },
        { journalEntry: { number: { contains: search, mode: "insensitive" } } },
        { journalEntry: { reference: { contains: search, mode: "insensitive" } } },
      ] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.enterpriseJournalLine.findMany({ where, orderBy: [{ journalEntry: { accountingDate: "desc" } }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { ledgerAccount: true, journalEntry: { include: { journal: true, fiscalPeriod: true } } } }),
      prisma.enterpriseJournalLine.count({ where }),
    ]);
    response = pageResult(rows.map((row) => ({
      id: row.id,
      status: row.journalEntry.status,
      number: row.journalEntry.number,
      accountingDate: row.journalEntry.accountingDate,
      reference: row.journalEntry.reference,
      description: row.description || row.journalEntry.description,
      accountCode: row.ledgerAccount.code,
      accountNameFr: row.ledgerAccount.nameFr,
      accountNameEn: row.ledgerAccount.nameEn,
      debit: row.debit.toFixed(),
      credit: row.credit.toFixed(),
      currencyCode: row.journalEntry.functionalCurrencyCode,
      journalCode: row.journalEntry.journal.code,
      periodCode: row.journalEntry.fiscalPeriod.code,
      journalEntryId: row.journalEntryId,
    })), page, pageSize, total);
  } else if (requestedView === "trial-balance") {
    const grouped = await prisma.enterpriseJournalLine.groupBy({
      by: ["ledgerAccountId"],
      where: { organizationId, journalEntry: { organizationId, status: "POSTED" } },
      _sum: { debit: true, credit: true },
      orderBy: { ledgerAccountId: "asc" },
    });
    const accountIds = grouped.map((row) => row.ledgerAccountId);
    const accounts = await prisma.enterpriseLedgerAccount.findMany({
      where: { organizationId, id: { in: accountIds }, ...(search ? { OR: [
        { code: { contains: search, mode: "insensitive" } },
        { nameFr: { contains: search, mode: "insensitive" } },
        { nameEn: { contains: search, mode: "insensitive" } },
      ] } : {}) },
      orderBy: { code: "asc" },
    });
    const groupedByAccount = new Map(grouped.map((row) => [row.ledgerAccountId, row]));
    const allItems = accounts.map((account) => {
      const row = groupedByAccount.get(account.id);
      const debit = row?._sum.debit || new Prisma.Decimal(0);
      const credit = row?._sum.credit || new Prisma.Decimal(0);
      return { id: account.id, code: account.code, nameFr: account.nameFr, nameEn: account.nameEn, accountType: account.accountType, debit: debit.toFixed(), credit: credit.toFixed(), balance: debit.minus(credit).toFixed(), currencyCode: account.currencyCode, status: account.isActive ? "ACTIVE" : "INACTIVE" };
    });
    const offset = (page - 1) * pageSize;
    response = pageResult(allItems.slice(offset, offset + pageSize), page, pageSize, allItems.length);
  } else if (requestedView === "posting-rules") {
    const where: Prisma.EnterpriseAccountMappingWhereInput = {
      organizationId,
      ...(status ? { isActive: status === "ACTIVE" } : {}),
      ...(search ? { OR: [
        { mappingKey: { contains: search, mode: "insensitive" } },
        { sourceModule: { contains: search, mode: "insensitive" } },
        { sourceEntityType: { contains: search, mode: "insensitive" } },
        { ledgerAccount: { code: { contains: search, mode: "insensitive" } } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.enterpriseAccountMapping.findMany({ where, orderBy: [{ isActive: "desc" }, { mappingKey: "asc" }], skip: (page - 1) * pageSize, take: pageSize, include: { ledgerAccount: true } }),
      prisma.enterpriseAccountMapping.count({ where }),
    ]);
    response = pageResult(items.map((item) => ({ ...item, status: item.isActive ? "ACTIVE" : "INACTIVE", accountCode: item.ledgerAccount.code, accountNameFr: item.ledgerAccount.nameFr, accountNameEn: item.ledgerAccount.nameEn })), page, pageSize, total);
  } else {
    const where: Prisma.EnterprisePostingBatchWhereInput = {
      organizationId,
      ...(status ? { status } : { status: "FAILED" }),
      ...(search ? { OR: [
        { reference: { contains: search, mode: "insensitive" } },
        { sourceEntityType: { contains: search, mode: "insensitive" } },
        { sourceEntityId: { contains: search, mode: "insensitive" } },
        { errorCode: { contains: search, mode: "insensitive" } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.enterprisePostingBatch.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, reference: true, postingEvent: true, sourceEntityType: true, sourceEntityId: true, postingVersion: true, status: true, errorCode: true, errorMessage: true, completedAt: true, createdAt: true, updatedAt: true } }),
      prisma.enterprisePostingBatch.count({ where }),
    ]);
    response = pageResult(items, page, pageSize, total);
  }

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "accounting-professional", view: requestedView, page } });
  return NextResponse.json(response);
}
