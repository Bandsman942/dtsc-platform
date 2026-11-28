import { Prisma } from "@prisma/client";
import { formatEnterpriseBusinessDate } from "@/lib/enterprise/business-context";
import type { MonetaryMetric } from "@/lib/enterprise/common/analytics";
import { isValidEnterpriseActivityCivilDate } from "@/lib/enterprise/enterprise-activity-civil-date";

import { medicalInvoiceStatuses } from "@/lib/health-billing-validators";

export const medicalInvoiceDetails = {
  patient: { select: { patientNumber: true, fullName: true } },
  consultation: { select: { consultationNumber: true } },
  createdBy: { select: { name: true } },
  items: true,
  payments: { where: { status: "CONFIRMED" }, orderBy: { paymentDate: "desc" } },
  events: { orderBy: { createdAt: "desc" }, take: 20, include: { actor: { select: { name: true } } } },
} satisfies Prisma.HealthMedicalInvoiceInclude;

type MedicalInvoice = Prisma.HealthMedicalInvoiceGetPayload<{ include: typeof medicalInvoiceDetails }>;

export function serializeMedicalInvoice(invoice: MedicalInvoice, canViewSensitive: boolean) {
  return {
    ...invoice,
    notesInternal: canViewSensitive ? invoice.notesInternal : null,
    subtotalAmount: Number(invoice.subtotalAmount),
    discountAmount: Number(invoice.discountAmount),
    taxAmount: Number(invoice.taxAmount),
    insuranceAmount: Number(invoice.insuranceAmount),
    patientAmount: Number(invoice.patientAmount),
    totalAmount: Number(invoice.totalAmount),
    paidAmount: Number(invoice.paidAmount),
    balanceAmount: Number(invoice.balanceAmount),
    items: invoice.items.map(item => ({
      ...item,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discountAmount: Number(item.discountAmount),
      totalAmount: Number(item.totalAmount),
    })),
    payments: invoice.payments.map(payment => ({
      ...payment,
      paymentReference: canViewSensitive ? payment.paymentReference : null,
      comment: canViewSensitive ? payment.comment : null,
      amount: Number(payment.amount),
    })),
  };
}

export function readMedicalInvoiceFilters(params: URLSearchParams) {
  const search = params.get("search")?.trim() || "";
  const status = params.get("status") || "";
  const dateFrom = params.get("dateFrom") || "";
  const dateTo = params.get("dateTo") || "";
  const page = Number(params.get("page") || "1");
  const pageSize = Number(params.get("pageSize") || "12");

  if (search.length > 160 || (status && !medicalInvoiceStatuses.some(value => value === status))
    || (dateFrom && !isValidEnterpriseActivityCivilDate(dateFrom))
    || (dateTo && !isValidEnterpriseActivityCivilDate(dateTo))
    || (dateFrom && dateTo && dateFrom > dateTo)
    || !Number.isSafeInteger(page) || page < 1 || page > 100_000
    || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return null;
  }
  return { search, status, dateFrom, dateTo, page, pageSize };
}

// Invoice forms store the selected civil date at UTC midnight.
function invoiceDateFilter(from: string, to: string) {
  return {
    gte: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
    lte: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
  };
}

const exportFields = {
  id: true,
  invoiceNumber: true,
  invoiceDate: true,
  currency: true,
  status: true,
  totalAmount: true,
  paidAmount: true,
  balanceAmount: true,
} satisfies Prisma.HealthMedicalInvoiceSelect;

const amountFields = [
  ["totalAmount", "invoiceTotal"],
  ["paidAmount", "paid"],
  ["balanceAmount", "outstanding"],
] as const satisfies ReadonlyArray<readonly [keyof typeof exportFields, MonetaryMetric]>;

export async function readMedicalInvoiceRegister(
  tx: Prisma.TransactionClient,
  organizationId: string,
  filters: NonNullable<ReturnType<typeof readMedicalInvoiceFilters>>,
  options: { exportRows: boolean; canViewSensitive: boolean },
) {
  const { search, status, dateFrom, dateTo, page, pageSize } = filters;
  const visibility = { organizationId };
  const terms = search.split(/\s+/).filter(Boolean);
  const where: Prisma.HealthMedicalInvoiceWhereInput = {
    ...visibility,
    ...(status ? { status } : {}),
    ...(dateFrom || dateTo ? { invoiceDate: invoiceDateFilter(dateFrom, dateTo) } : {}),
    AND: terms.map(term => {
      const match = { contains: term.replace(/[\\_%]/g, "\\$&"), mode: "insensitive" } as const;
      return { OR: [{ invoiceNumber: match }, { patient: { fullName: match } }, { patient: { patientNumber: match } }] };
    }),
  };
  const hasFilters = Boolean(terms.length || status || dateFrom || dateTo);
  const paging = {
    where,
    orderBy: [{ invoiceDate: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  } satisfies Prisma.HealthMedicalInvoiceFindManyArgs;
  const aggregate = (scope: Prisma.HealthMedicalInvoiceWhereInput) => tx.healthMedicalInvoice.groupBy({
    by: ["currency", "status"],
    where: scope,
    _sum: { totalAmount: true, paidAmount: true, balanceAmount: true },
    _count: { _all: true },
    orderBy: [{ currency: "asc" }, { status: "asc" }],
  });
  const general = aggregate(visibility);
  const readRows = async () => {
    if (options.exportRows) {
      const rows = await tx.healthMedicalInvoice.findMany({ ...paging, select: exportFields });
      return rows.map(row => ({
        ...row,
        totalAmount: row.totalAmount.toFixed(),
        paidAmount: row.paidAmount.toFixed(),
        balanceAmount: row.balanceAmount.toFixed(),
      }));
    }

    const rows = await tx.healthMedicalInvoice.findMany({ ...paging, include: medicalInvoiceDetails });
    return rows.map(row => serializeMedicalInvoice(row, options.canViewSensitive));
  };
  const readCounts = async () => {
    if (options.exportRows) return null;
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
    const today = formatEnterpriseBusinessDate(new Date(), organization.timezone);
    const [todayCount, pending] = await Promise.all([
      tx.healthMedicalInvoice.count({ where: { AND: [where, { invoiceDate: invoiceDateFilter(today, today) }] } }),
      tx.healthMedicalInvoice.count({ where: { AND: [where, { balanceAmount: { gt: 0 }, status: { notIn: ["DRAFT", "CANCELLED"] } }] } }),
    ]);
    return { today: todayCount, pending };
  };
  const [items, filteredGroups, generalGroups, counts] = await Promise.all([
    readRows(),
    hasFilters ? aggregate(where) : general,
    general,
    readCounts(),
  ]);
  const ids = items.map(item => item.id);
  const pageGroups = ids.length ? await aggregate({ organizationId, id: { in: ids } }) : [];
  const totals = (groups: typeof pageGroups) => groups.flatMap(group => amountFields.flatMap(([field, metric]) => {
    const amount = group._sum[field];
    return amount === null ? [] : [{ currencyCode: group.currency, status: group.status, metric, amount: amount.toFixed() }];
  }));
  const count = (groups: typeof pageGroups) => groups.reduce((sum, group) => sum + group._count._all, 0);
  const total = count(filteredGroups);
  return {
    items,
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    authorizedCount: count(generalGroups),
    ...(counts ? { metrics: {
      ...counts,
      partial: count(filteredGroups.filter(group => group.status === "PARTIAL_PAID")),
      paid: count(filteredGroups.filter(group => group.status === "PAID")),
    } } : {}),
    filteredTotals: totals(filteredGroups),
    generalTotals: totals(generalGroups),
    pageTotals: totals(pageGroups),
  };
}
