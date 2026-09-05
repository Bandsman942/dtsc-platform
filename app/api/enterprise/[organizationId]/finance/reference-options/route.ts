import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest } from "@/lib/enterprise/accounting/http";
import type { EnterpriseFinanceModuleCode } from "@/lib/enterprise/accounting/constants";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
type SupportedModule = "FINANCE_RECEIVABLES" | "FINANCE_PAYABLES" | "FINANCE_PAYMENTS";
type ReferenceKind =
  | "customer"
  | "supplier"
  | "sales-order"
  | "fulfillment"
  | "contract"
  | "purchase"
  | "purchase-receipt"
  | "project"
  | "expense"
  | "asset"
  | "catalog-item"
  | "financial-account"
  | "payroll-run"
  | "employee"
  | "expense-account";

const MODULES = new Set<SupportedModule>(["FINANCE_RECEIVABLES", "FINANCE_PAYABLES", "FINANCE_PAYMENTS"]);
const KINDS = new Set<ReferenceKind>([
  "customer", "supplier", "sales-order", "fulfillment", "contract", "purchase", "purchase-receipt", "project", "expense", "asset", "catalog-item", "financial-account", "payroll-run", "employee", "expense-account",
]);

function permitted(moduleCode: SupportedModule, kind: ReferenceKind) {
  if (moduleCode === "FINANCE_RECEIVABLES") return ["customer", "sales-order", "fulfillment", "contract", "project", "catalog-item"].includes(kind);
  if (moduleCode === "FINANCE_PAYABLES") return ["supplier", "purchase", "purchase-receipt", "project", "expense", "asset", "catalog-item", "expense-account"].includes(kind);
  return ["customer", "supplier", "financial-account", "payroll-run", "employee"].includes(kind);
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const url = new URL(req.url);
  const moduleCode = (url.searchParams.get("module") || "").toUpperCase() as SupportedModule;
  const kind = (url.searchParams.get("kind") || "") as ReferenceKind;
  if (!MODULES.has(moduleCode) || !KINDS.has(kind) || !permitted(moduleCode, kind)) {
    return NextResponse.json({ error: "Forbidden", message: "Cette référence n’est pas disponible dans ce module Finance." }, { status: 403 });
  }

  const auth = await authorizeFinanceRequest(req, organizationId, moduleCode as EnterpriseFinanceModuleCode, "view");
  if (!auth.ok) return auth.response;

  const search = url.searchParams.get("search")?.trim() || "";
  const parentId = url.searchParams.get("parentId")?.trim() || undefined;
  const take = 30;
  let items: Array<Record<string, unknown>> = [];

  if (kind === "customer") {
    items = await prisma.enterpriseBusinessParty.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null, roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } }, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { legalName: { contains: search, mode: "insensitive" } }, { displayName: { contains: search, mode: "insensitive" } }] } : {}) },
      orderBy: [{ displayName: "asc" }, { legalName: "asc" }], take,
      select: { id: true, code: true, legalName: true, displayName: true },
    });
  } else if (kind === "supplier") {
    const suppliers = await prisma.enterpriseSupplier.findMany({
      where: { organizationId, status: { in: ["ACTIVE", "APPROVED"] }, archivedAt: null, ...(search ? { OR: [{ legalName: { contains: search, mode: "insensitive" } }, { displayName: { contains: search, mode: "insensitive" } }] } : {}) },
      orderBy: [{ displayName: "asc" }, { legalName: "asc" }], take,
      select: { id: true, legalName: true, displayName: true },
    });
    const links = suppliers.length ? await prisma.enterpriseSupplierPartyLink.findMany({ where: { organizationId, supplierId: { in: suppliers.map((supplier) => supplier.id) }, archivedAt: null }, select: { supplierId: true, businessPartyId: true } }) : [];
    const partyBySupplier = new Map(links.map((link) => [link.supplierId, link.businessPartyId]));
    items = suppliers.map((supplier) => ({ ...supplier, businessPartyId: partyBySupplier.get(supplier.id) || null }));
  } else if (kind === "sales-order") {
    items = await prisma.enterpriseSalesOrder.findMany({
      where: { organizationId, archivedAt: null, status: { notIn: ["CANCELLED", "CLOSED"] }, ...(parentId ? { businessPartyId: parentId } : {}), ...(search ? { OR: [{ reference: { contains: search, mode: "insensitive" } }, { title: { contains: search, mode: "insensitive" } }] } : {}) },
      orderBy: { createdAt: "desc" }, take,
      select: { id: true, reference: true, title: true, businessPartyId: true, contractId: true, status: true, currency: true, totalAmount: true },
    });
  } else if (kind === "fulfillment") {
    items = await prisma.enterpriseFulfillment.findMany({
      where: { organizationId, status: { in: ["FULFILLED", "ACCEPTED", "COMPLETED"] }, ...(parentId ? { salesOrderId: parentId } : {}), ...(search ? { reference: { contains: search, mode: "insensitive" } } : {}) },
      orderBy: { createdAt: "desc" }, take,
      select: { id: true, reference: true, salesOrderId: true, status: true, fulfilledAt: true },
    });
  } else if (kind === "contract") {
    items = await prisma.enterpriseContract.findMany({
      where: { organizationId, archivedAt: null, status: { in: ["APPROVED", "ACTIVE"] }, ...(parentId ? { businessPartyId: parentId } : {}), ...(search ? { OR: [{ reference: { contains: search, mode: "insensitive" } }, { title: { contains: search, mode: "insensitive" } }] } : {}) },
      orderBy: { createdAt: "desc" }, take,
      select: { id: true, reference: true, title: true, businessPartyId: true, status: true, currency: true, indicativeAmount: true },
    });
  } else if (kind === "purchase") {
    items = await prisma.enterprisePurchase.findMany({
      where: { organizationId, archivedAt: null, status: { notIn: ["CANCELLED", "REJECTED"] }, ...(parentId ? { supplierId: parentId } : {}), ...(search ? { OR: [{ reference: { contains: search, mode: "insensitive" } }, { title: { contains: search, mode: "insensitive" } }] } : {}) },
      orderBy: { createdAt: "desc" }, take,
      select: { id: true, reference: true, title: true, supplierId: true, status: true, currency: true, totalAmount: true },
    });
  } else if (kind === "purchase-receipt") {
    items = await prisma.enterprisePurchaseReceipt.findMany({
      where: { organizationId, ...(parentId ? { purchaseId: parentId } : {}), ...(search ? { reference: { contains: search, mode: "insensitive" } } : {}) },
      orderBy: { createdAt: "desc" }, take,
      select: { id: true, reference: true, purchaseId: true, createdAt: true },
    });
  } else if (kind === "project") {
    items = await prisma.enterpriseProject.findMany({
      where: { organizationId, archivedAt: null, status: { notIn: ["CANCELLED", "ARCHIVED"] }, ...(search ? { OR: [{ reference: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] } : {}) },
      orderBy: { name: "asc" }, take,
      select: { id: true, reference: true, name: true, status: true },
    });
  } else if (kind === "expense") {
    items = await prisma.enterpriseExpense.findMany({
      where: { organizationId, archivedAt: null, status: "APPROVED", accountedAt: null, supplierInvoiceId: null, ...(parentId ? { supplierId: parentId } : {}), ...(search ? { OR: [{ reference: { contains: search, mode: "insensitive" } }, { title: { contains: search, mode: "insensitive" } }] } : {}) },
      orderBy: { expenseDate: "desc" }, take,
      select: { id: true, reference: true, title: true, currency: true, amount: true, supplierId: true, purchaseId: true },
    });
  } else if (kind === "asset") {
    items = await prisma.enterpriseAsset.findMany({
      where: { organizationId, archivedAt: null, status: { notIn: ["DISPOSED", "ARCHIVED", "CANCELLED"] }, ...(parentId ? { supplierId: parentId } : {}), ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }, { serialNumber: { contains: search, mode: "insensitive" } }] } : {}) },
      orderBy: { name: "asc" }, take,
      select: { id: true, code: true, name: true, serialNumber: true, supplierId: true, purchaseId: true, currency: true, indicativeValue: true },
    });
  } else if (kind === "catalog-item") {
    const catalog = await prisma.enterpriseCatalogItem.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { sku: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] } : {}) },
      orderBy: { name: "asc" }, take,
      select: { id: true, code: true, sku: true, name: true, currency: true, indicativeSalePrice: true, indicativeCost: true },
    });
    items = catalog.map((item) => ({ ...item, amount: moduleCode === "FINANCE_RECEIVABLES" ? item.indicativeSalePrice : item.indicativeCost }));
  } else if (kind === "financial-account") {
    items = await prisma.enterpriseFinancialAccount.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }, { currencyCode: { contains: search, mode: "insensitive" } }, { maskedReference: { contains: search, mode: "insensitive" } }] } : {}) },
      orderBy: [{ accountType: "asc" }, { code: "asc" }], take,
      select: { id: true, code: true, name: true, accountType: true, currencyCode: true, maskedReference: true },
    });
  } else if (kind === "payroll-run") {
    items = await prisma.enterprisePayrollRun.findMany({
      where: { organizationId, archivedAt: null, status: "APPROVED", ...(search ? { OR: [{ reference: { contains: search, mode: "insensitive" } }, { payrollPeriod: { OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] } }] } : {}) },
      orderBy: { approvedAt: "desc" }, take,
      select: { id: true, reference: true, status: true, currency: true, netAmount: true, payrollPeriod: { select: { code: true, name: true } } },
    });
  } else if (kind === "employee") {
    items = await prisma.enterpriseEmployee.findMany({
      where: { organizationId, employmentStatus: "ACTIVE", archivedAt: null, ...(search ? { OR: [{ employeeNumber: { contains: search, mode: "insensitive" } }, { displayName: { contains: search, mode: "insensitive" } }, { workEmail: { contains: search, mode: "insensitive" } }] } : {}) },
      orderBy: { displayName: "asc" }, take,
      select: { id: true, employeeNumber: true, displayName: true, workEmail: true },
    });
  } else if (kind === "expense-account") {
    items = await prisma.enterpriseLedgerAccount.findMany({
      where: { organizationId, isActive: true, archivedAt: null, allowDirectPosting: true, accountType: { in: ["EXPENSE", "OTHER_EXPENSE"] }, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { nameFr: { contains: search, mode: "insensitive" } }, { nameEn: { contains: search, mode: "insensitive" } }] } : {}) },
      orderBy: { code: "asc" }, take,
      select: { id: true, code: true, nameFr: true, nameEn: true, accountType: true },
    });
  }

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "finance-reference-options", moduleCode, kind, hasSearch: Boolean(search), hasParent: Boolean(parentId) } });
  return NextResponse.json({ items });
}
