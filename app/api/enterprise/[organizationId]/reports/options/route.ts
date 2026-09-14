import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { enterpriseBudgetVisibilityWhere, getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

type SelectOption = { id: string; label: string; meta?: string | null };

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim().toUpperCase()).filter((value): value is string => Boolean(value)))].sort();
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const reportsAccess = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "read" });
  if (!reportsAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [financeCapabilities, procurementCapabilities, departments] = await Promise.all([
    resolveEnterpriseModuleCapabilities({ userId: session.userId, organizationId, moduleCode: "FINANCE_BUDGETS" }),
    resolveEnterpriseModuleCapabilities({ userId: session.userId, organizationId, moduleCode: "SUPPLIERS_PURCHASES" }),
    prisma.enterpriseDepartment.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }],
      take: 300,
      select: { id: true, departmentCode: true, labelFr: true, labelEn: true },
    }),
  ]);

  const financeCanSeeAll = financeCapabilities.canApprove || financeCapabilities.canManage;
  const budgetVisibility = financeCapabilities.canRead
    ? enterpriseBudgetVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: financeCanSeeAll })
    : null;

  const [budgets, suppliers, financeConfiguration, financialAccountCurrencies, budgetCategories, expenseCategories, purchaseCurrencies] = await Promise.all([
    budgetVisibility
      ? prisma.enterpriseBudget.findMany({
          where: { ...budgetVisibility, archivedAt: null, status: { notIn: ["CANCELLED", "REJECTED"] } },
          orderBy: [{ periodEnd: "desc" }, { title: "asc" }],
          take: 300,
          select: { id: true, reference: true, title: true, currency: true, status: true },
        })
      : Promise.resolve([]),
    procurementCapabilities.canRead
      ? prisma.enterpriseSupplier.findMany({
          where: { organizationId, archivedAt: null, status: { not: "ARCHIVED" } },
          orderBy: [{ legalName: "asc" }],
          take: 500,
          select: { id: true, legalName: true, displayName: true, status: true },
        })
      : Promise.resolve([]),
    financeCapabilities.canRead
      ? prisma.enterpriseFinanceConfiguration.findUnique({
          where: { organizationId },
          select: { functionalCurrencyCode: true, presentationCurrencyCode: true },
        })
      : Promise.resolve(null),
    financeCapabilities.canRead
      ? prisma.enterpriseFinancialAccount.findMany({
          where: { organizationId, status: "ACTIVE", archivedAt: null },
          distinct: ["currencyCode"],
          orderBy: { currencyCode: "asc" },
          take: 50,
          select: { currencyCode: true },
        })
      : Promise.resolve([]),
    financeCapabilities.canRead
      ? prisma.enterpriseBudgetLine.findMany({
          where: { organizationId, category: { not: null } },
          distinct: ["category"],
          orderBy: { category: "asc" },
          take: 250,
          select: { category: true },
        })
      : Promise.resolve([]),
    financeCapabilities.canRead
      ? prisma.enterpriseExpense.findMany({
          where: { organizationId, archivedAt: null, category: { not: null } },
          distinct: ["category"],
          orderBy: { category: "asc" },
          take: 250,
          select: { category: true },
        })
      : Promise.resolve([]),
    procurementCapabilities.canRead
      ? prisma.enterprisePurchase.findMany({
          where: { organizationId, archivedAt: null },
          distinct: ["currency"],
          orderBy: { currency: "asc" },
          take: 50,
          select: { currency: true },
        })
      : Promise.resolve([]),
  ]);

  const currencies = unique([
    financeConfiguration?.functionalCurrencyCode,
    financeConfiguration?.presentationCurrencyCode,
    ...financialAccountCurrencies.map((item) => item.currencyCode),
    ...budgets.map((item) => item.currency),
    ...purchaseCurrencies.map((item) => item.currency),
  ]);
  const categories = [...new Set([...budgetCategories, ...expenseCategories].map((item) => item.category?.trim()).filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right));

  const mappedDepartments: SelectOption[] = departments.map((item) => ({ id: item.id, label: item.labelFr, meta: item.departmentCode }));
  const mappedSuppliers: SelectOption[] = suppliers.map((item) => ({ id: item.id, label: item.displayName || item.legalName, meta: item.status }));
  const mappedBudgets: SelectOption[] = budgets.map((item) => ({ id: item.id, label: `${item.reference} · ${item.title}`, meta: `${item.currency} · ${item.status}` }));

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "report-options" } });
  return NextResponse.json({
    departments: mappedDepartments,
    suppliers: mappedSuppliers,
    budgets: mappedBudgets,
    currencies: currencies.map((id) => ({ id, label: id })),
    categories: categories.map((id) => ({ id, label: id })),
    sourceAvailability: {
      finance: financeCapabilities.canRead,
      procurement: procurementCapabilities.canRead,
    },
  });
}
