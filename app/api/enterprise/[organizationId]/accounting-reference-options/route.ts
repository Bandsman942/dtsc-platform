import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest } from "@/lib/enterprise/accounting/http";
import type { EnterpriseFinanceModuleCode } from "@/lib/enterprise/accounting/constants";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
type SupportedModule =
  | "FINANCE_ACCOUNTING"
  | "FINANCE_TAX"
  | "FINANCE_CLOSE"
  | "FINANCE_STATEMENTS"
  | "FINANCE_ASSETS";
type ReferenceKind =
  | "chart"
  | "fiscal-year"
  | "fiscal-period"
  | "journal"
  | "ledger-account"
  | "asset"
  | "currency";

const MODULES = new Set<SupportedModule>([
  "FINANCE_ACCOUNTING",
  "FINANCE_TAX",
  "FINANCE_CLOSE",
  "FINANCE_STATEMENTS",
  "FINANCE_ASSETS",
]);
const KINDS = new Set<ReferenceKind>([
  "chart",
  "fiscal-year",
  "fiscal-period",
  "journal",
  "ledger-account",
  "asset",
  "currency",
]);

function permitted(moduleCode: SupportedModule, kind: ReferenceKind) {
  if (moduleCode === "FINANCE_ACCOUNTING") return ["chart", "fiscal-year", "fiscal-period", "journal", "ledger-account", "currency"].includes(kind);
  if (moduleCode === "FINANCE_TAX") return ["ledger-account", "currency"].includes(kind);
  if (moduleCode === "FINANCE_CLOSE") return ["fiscal-period"].includes(kind);
  if (moduleCode === "FINANCE_STATEMENTS") return ["currency"].includes(kind);
  return ["asset", "ledger-account", "currency"].includes(kind);
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
  const status = url.searchParams.get("status")?.trim().toUpperCase() || undefined;
  const accountType = url.searchParams.get("accountType")?.trim().toUpperCase() || undefined;
  const directPosting = url.searchParams.get("directPosting") === "true";
  const take = 30;
  let items: Array<Record<string, unknown>> = [];

  if (kind === "chart") {
    items = await prisma.enterpriseChartOfAccounts.findMany({
      where: {
        organizationId,
        ...(status ? { status } : {}),
        ...(search ? { OR: [
          { code: { contains: search, mode: "insensitive" } },
          { nameFr: { contains: search, mode: "insensitive" } },
          { nameEn: { contains: search, mode: "insensitive" } },
        ] } : {}),
      },
      orderBy: [{ status: "asc" }, { code: "asc" }],
      take,
      select: { id: true, code: true, nameFr: true, nameEn: true, status: true, templateCode: true },
    });
  } else if (kind === "fiscal-year") {
    items = await prisma.enterpriseFiscalYear.findMany({
      where: {
        organizationId,
        ...(status ? { status } : {}),
        ...(search ? { code: { contains: search, mode: "insensitive" } } : {}),
      },
      orderBy: { startDate: "desc" },
      take,
      select: { id: true, code: true, startDate: true, endDate: true, status: true, revision: true },
    });
  } else if (kind === "fiscal-period") {
    items = await prisma.enterpriseFiscalPeriod.findMany({
      where: {
        organizationId,
        ...(parentId ? { fiscalYearId: parentId } : {}),
        ...(status ? { status } : {}),
        ...(search ? { code: { contains: search, mode: "insensitive" } } : {}),
      },
      orderBy: { startDate: "desc" },
      take,
      select: { id: true, code: true, fiscalYearId: true, startDate: true, endDate: true, status: true, revision: true, fiscalYear: { select: { code: true } } },
    });
  } else if (kind === "journal") {
    items = await prisma.enterpriseJournal.findMany({
      where: {
        organizationId,
        ...(status === "INACTIVE" ? { isActive: false } : status === "ALL" ? {} : { isActive: true }),
        ...(search ? { OR: [
          { code: { contains: search, mode: "insensitive" } },
          { nameFr: { contains: search, mode: "insensitive" } },
          { nameEn: { contains: search, mode: "insensitive" } },
          { journalType: { contains: search, mode: "insensitive" } },
        ] } : {}),
      },
      orderBy: { code: "asc" },
      take,
      select: { id: true, code: true, nameFr: true, nameEn: true, journalType: true, isActive: true, requiresApproval: true },
    });
  } else if (kind === "ledger-account") {
    items = await prisma.enterpriseLedgerAccount.findMany({
      where: {
        organizationId,
        archivedAt: null,
        isActive: true,
        ...(parentId ? { chartId: parentId } : {}),
        ...(accountType ? { accountType } : {}),
        ...(directPosting ? { allowDirectPosting: true } : {}),
        ...(search ? { OR: [
          { code: { contains: search, mode: "insensitive" } },
          { nameFr: { contains: search, mode: "insensitive" } },
          { nameEn: { contains: search, mode: "insensitive" } },
        ] } : {}),
      },
      orderBy: { code: "asc" },
      take,
      select: { id: true, code: true, nameFr: true, nameEn: true, accountType: true, currencyCode: true, chartId: true, allowDirectPosting: true },
    });
  } else if (kind === "asset") {
    const existingProfiles = await prisma.enterpriseAssetAccountingProfile.findMany({
      where: { organizationId },
      select: { assetId: true },
    });
    items = await prisma.enterpriseAsset.findMany({
      where: {
        organizationId,
        archivedAt: null,
        id: { notIn: existingProfiles.map((profile) => profile.assetId) },
        status: { notIn: ["DISPOSED", "ARCHIVED", "CANCELLED"] },
        ...(search ? { OR: [
          { code: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
          { serialNumber: { contains: search, mode: "insensitive" } },
        ] } : {}),
      },
      orderBy: { name: "asc" },
      take,
      select: { id: true, code: true, name: true, serialNumber: true, status: true, currency: true, indicativeValue: true, acquisitionDate: true },
    });
  } else if (kind === "currency") {
    items = await prisma.enterpriseCurrency.findMany({
      where: {
        isActive: true,
        OR: [{ organizationId }, { organizationId: null }],
        ...(search ? { AND: [{ OR: [
          { code: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
        ] }] } : {}),
      },
      orderBy: { code: "asc" },
      take,
      select: { id: true, code: true, name: true, symbol: true, precision: true },
    });
  }

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: auth.session.userId,
    startedAt,
    metadata: { organizationId, domain: "accounting-reference-options", moduleCode, kind, hasSearch: Boolean(search), hasParent: Boolean(parentId) },
  });
  return NextResponse.json({ items });
}
