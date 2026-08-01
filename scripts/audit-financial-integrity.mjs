#!/usr/bin/env node
import { Prisma, PrismaClient } from "@prisma/client";

function parseArgs(argv) {
  const result = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--") continue;
    if (value === "--json") result.json = true;
    else if (value === "--organization-id") result.organizationId = argv[++index];
    else if (value === "--period-id") result.periodId = argv[++index];
    else if (value === "--from-date") result.fromDate = argv[++index];
    else if (value === "--to-date") result.toDate = argv[++index];
    else throw new Error(`Unknown argument: ${value}`);
  }
  return result;
}

function dateFilter(args) {
  const filter = {};
  if (args.fromDate) filter.gte = new Date(args.fromDate);
  if (args.toDate) filter.lte = new Date(args.toDate);
  if ((filter.gte && Number.isNaN(filter.gte.getTime())) || (filter.lte && Number.isNaN(filter.lte.getTime()))) throw new Error("Invalid date range");
  return Object.keys(filter).length ? filter : null;
}

async function scan(delegate, options, inspect) {
  let cursor;
  let count = 0;
  do {
    const rows = await delegate.findMany({
      ...options,
      take: 500,
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const row of rows) count += inspect(row) ? 1 : 0;
    cursor = rows.length === 500 ? rows.at(-1)?.id : undefined;
  } while (cursor);
  return count;
}

function unequal(left, right) {
  return !new Prisma.Decimal(left).equals(new Prisma.Decimal(right));
}

function negative(value) {
  return new Prisma.Decimal(value).isNegative();
}

async function auditOrganization(prisma, organizationId, args, range) {
  const journalWhere = {
    organizationId,
    status: "POSTED",
    ...(args.periodId ? { fiscalPeriodId: args.periodId } : {}),
    ...(range ? { accountingDate: range } : {}),
  };
  const imbalancedEntries = await scan(
    prisma.enterpriseJournalEntry,
    { where: journalWhere, select: { id: true, totalDebit: true, totalCredit: true, sourceEntityType: true, sourceEntityId: true } },
    (entry) => unequal(entry.totalDebit, entry.totalCredit),
  );
  const postedWithoutSource = await scan(
    prisma.enterpriseJournalEntry,
    { where: journalWhere, select: { id: true, totalDebit: true, totalCredit: true, sourceEntityType: true, sourceEntityId: true } },
    (entry) => !entry.sourceEntityType || !entry.sourceEntityId,
  );
  const invoicesWithoutReceivable = await scan(
    prisma.enterpriseSalesInvoice,
    {
      where: { organizationId, archivedAt: null, status: { in: ["ISSUED", "POSTED", "PARTIALLY_PAID", "PAID"] }, ...(range ? { invoiceDate: range } : {}) },
      select: { id: true, status: true, grandTotal: true, amountPaid: true, outstandingAmount: true, receivable: { select: { id: true } } },
    },
    (invoice) => !invoice.receivable,
  );
  const paidInvoicesWithOutstanding = await scan(
    prisma.enterpriseSalesInvoice,
    {
      where: { organizationId, archivedAt: null, status: "PAID", ...(range ? { invoiceDate: range } : {}) },
      select: { id: true, status: true, grandTotal: true, amountPaid: true, outstandingAmount: true, receivable: { select: { id: true } } },
    },
    (invoice) => !new Prisma.Decimal(invoice.outstandingAmount).isZero(),
  );
  const negativeReceivables = await scan(
    prisma.enterpriseReceivable,
    { where: { organizationId }, select: { id: true, originalAmount: true, allocatedAmount: true, creditedAmount: true, writtenOffAmount: true, outstandingAmount: true } },
    (receivable) => negative(receivable.outstandingAmount),
  );
  const overAllocatedReceivables = await scan(
    prisma.enterpriseReceivable,
    { where: { organizationId }, select: { id: true, originalAmount: true, allocatedAmount: true, creditedAmount: true, writtenOffAmount: true, outstandingAmount: true } },
    (receivable) => new Prisma.Decimal(receivable.allocatedAmount).plus(receivable.creditedAmount).plus(receivable.writtenOffAmount).greaterThan(receivable.originalAmount),
  );
  const negativePayables = await scan(
    prisma.enterprisePayable,
    { where: { organizationId }, select: { id: true, originalAmount: true, allocatedAmount: true, creditedAmount: true, outstandingAmount: true } },
    (payable) => negative(payable.outstandingAmount),
  );
  const overAllocatedPayables = await scan(
    prisma.enterprisePayable,
    { where: { organizationId }, select: { id: true, originalAmount: true, allocatedAmount: true, creditedAmount: true, outstandingAmount: true } },
    (payable) => new Prisma.Decimal(payable.allocatedAmount).plus(payable.creditedAmount).greaterThan(payable.originalAmount),
  );
  const closedPeriodDraftEntries = await prisma.enterpriseJournalEntry.count({
    where: {
      organizationId,
      status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] },
      fiscalPeriod: { status: { in: ["CLOSED", "LOCKED"] } },
    },
  });
  const duplicateSectorPostings = await prisma.enterpriseJournalEntry.groupBy({
    by: ["sourceModule", "sourceEntityType", "sourceEntityId", "postingEvent", "postingVersion"],
    where: { ...journalWhere, sourceModule: { in: ["PHARMACY", "HEALTH_CARE", "PHARMACY_SALES", "HEALTH_BILLING"] }, sourceEntityId: { not: null } },
    _count: { _all: true },
    having: { id: { _count: { gt: 1 } } },
  }).then((rows) => rows.length);

  const findings = {
    imbalancedEntries,
    postedWithoutSource,
    invoicesWithoutReceivable,
    paidInvoicesWithOutstanding,
    negativeReceivables,
    overAllocatedReceivables,
    negativePayables,
    overAllocatedPayables,
    closedPeriodDraftEntries,
    duplicateSectorPostings,
  };
  const critical = imbalancedEntries + invoicesWithoutReceivable + paidInvoicesWithOutstanding + negativeReceivables + overAllocatedReceivables + negativePayables + overAllocatedPayables + closedPeriodDraftEntries + duplicateSectorPostings;
  return { organizationId, status: critical === 0 ? "PASS" : "FAIL", findings };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const range = dateFilter(args);
  const prisma = new PrismaClient();
  try {
    const organizations = await prisma.organization.findMany({
      where: { deletedAt: null, ...(args.organizationId ? { id: args.organizationId } : {}) },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    if (args.organizationId && organizations.length === 0) throw new Error("Organization not found");
    const results = [];
    for (const organization of organizations) results.push(await auditOrganization(prisma, organization.id, args, range));
    const report = { generatedAt: new Date().toISOString(), periodId: args.periodId || null, range: { from: args.fromDate || null, to: args.toDate || null }, results };
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else for (const result of results) console.log(`${result.organizationId}: ${result.status} ${JSON.stringify(result.findings)}`);
    if (results.some((result) => result.status === "FAIL")) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Financial integrity audit failed");
  process.exitCode = 1;
});
