import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest } from "@/lib/enterprise/accounting/http";
import type { EnterpriseFinanceModuleCode } from "@/lib/enterprise/accounting/constants";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
type TreasuryModule = "FINANCE_TREASURY" | "FINANCE_CASH" | "FINANCE_BANK" | "FINANCE_RECONCILIATION";
type TreasuryReferenceKind = "financial-account" | "ledger-account" | "member" | "site" | "currency" | "bank-statement";

const MODULES = new Set<TreasuryModule>(["FINANCE_TREASURY", "FINANCE_CASH", "FINANCE_BANK", "FINANCE_RECONCILIATION"]);
const KINDS = new Set<TreasuryReferenceKind>(["financial-account", "ledger-account", "member", "site", "currency", "bank-statement"]);

function kindAllowed(moduleCode: TreasuryModule, kind: TreasuryReferenceKind) {
  if (moduleCode === "FINANCE_TREASURY") return ["financial-account", "ledger-account", "member", "site", "currency"].includes(kind);
  if (moduleCode === "FINANCE_CASH") return ["financial-account", "site"].includes(kind);
  if (moduleCode === "FINANCE_BANK") return ["financial-account", "currency"].includes(kind);
  return ["financial-account", "bank-statement"].includes(kind);
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const url = new URL(req.url);
  const requestedModule = (url.searchParams.get("module") || "FINANCE_TREASURY").toUpperCase() as TreasuryModule;
  const kind = (url.searchParams.get("kind") || "") as TreasuryReferenceKind;
  if (!MODULES.has(requestedModule)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const auth = await authorizeFinanceRequest(req, organizationId, requestedModule as EnterpriseFinanceModuleCode, "view");
  if (!auth.ok) return auth.response;

  const search = url.searchParams.get("search")?.trim() || "";
  const parentId = url.searchParams.get("parentId")?.trim() || undefined;
  if (kind) {
    if (!KINDS.has(kind) || !kindAllowed(requestedModule, kind)) return NextResponse.json({ error: "Forbidden", message: "Cette référence n’est pas disponible dans ce module Finance." }, { status: 403 });
    const take = 30;
    let items: Array<Record<string, unknown>> = [];
    if (kind === "financial-account") {
      items = await prisma.enterpriseFinancialAccount.findMany({
        where: {
          organizationId,
          status: "ACTIVE",
          archivedAt: null,
          ...(requestedModule === "FINANCE_CASH" ? { accountType: { in: ["CASH", "MOBILE_MONEY"] } } : {}),
          ...(requestedModule === "FINANCE_BANK" ? { accountType: "BANK" } : {}),
          ...(parentId ? { currencyCode: parentId.toUpperCase() } : {}),
          ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }, { currencyCode: { contains: search, mode: "insensitive" } }, { maskedReference: { contains: search, mode: "insensitive" } }] } : {}),
        },
        orderBy: [{ accountType: "asc" }, { code: "asc" }],
        take,
        select: { id: true, code: true, name: true, accountType: true, currencyCode: true, maskedReference: true, operationalBalance: true, availableBalance: true, revision: true },
      });
    } else if (kind === "ledger-account") {
      items = await prisma.enterpriseLedgerAccount.findMany({
        where: {
          organizationId,
          isActive: true,
          archivedAt: null,
          accountSubtype: { in: ["CASH", "BANK", "MOBILE_MONEY", "CLEARING"] },
          ...(parentId ? { accountSubtype: parentId } : {}),
          ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { nameFr: { contains: search, mode: "insensitive" } }, { nameEn: { contains: search, mode: "insensitive" } }] } : {}),
        },
        orderBy: { code: "asc" },
        take,
        select: { id: true, code: true, nameFr: true, nameEn: true, accountType: true, accountSubtype: true, currencyCode: true },
      });
    } else if (kind === "member") {
      const members = await prisma.organizationMember.findMany({
        where: {
          organizationId,
          status: "ACTIVE",
          removedAt: null,
          ...(search ? { OR: [{ user: { name: { contains: search, mode: "insensitive" } } }, { user: { email: { contains: search, mode: "insensitive" } } }, { positionTitle: { contains: search, mode: "insensitive" } }] } : {}),
        },
        orderBy: { user: { name: "asc" } },
        take,
        select: { userId: true, role: true, positionTitle: true, user: { select: { name: true, email: true } } },
      });
      items = members.map((member) => ({ id: member.userId, label: member.user.name || member.user.email, email: member.user.email, role: member.role, positionTitle: member.positionTitle }));
    } else if (kind === "site") {
      items = await prisma.enterpriseSite.findMany({
        where: { organizationId, status: "ACTIVE", archivedAt: null, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] } : {}) },
        orderBy: { name: "asc" }, take,
        select: { id: true, code: true, name: true },
      });
    } else if (kind === "currency") {
      items = await prisma.enterpriseCurrency.findMany({
        where: { isActive: true, OR: [{ organizationId }, { organizationId: null }], ...(search ? { OR: [{ organizationId }, { organizationId: null }], code: { contains: search, mode: "insensitive" } } : {}) },
        orderBy: { code: "asc" }, take,
        select: { id: true, code: true, name: true, symbol: true, precision: true },
      });
    } else if (kind === "bank-statement") {
      items = await prisma.enterpriseBankStatement.findMany({
        where: {
          organizationId,
          ...(parentId ? { financialAccountId: parentId } : {}),
          ...(search ? { OR: [{ reference: { contains: search, mode: "insensitive" } }, { currencyCode: { contains: search, mode: "insensitive" } }] } : {}),
        },
        orderBy: { statementDate: "desc" }, take,
        select: { id: true, reference: true, statementDate: true, periodStart: true, periodEnd: true, currencyCode: true, financialAccountId: true, status: true },
      });
    }
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "treasury-reference-options", moduleCode: requestedModule, kind, hasSearch: Boolean(search), hasParent: Boolean(parentId) } });
    return NextResponse.json({ items });
  }

  // Backward-compatible aggregate payload for the legacy Treasury workspace while #580 rolls out.
  if (requestedModule !== "FINANCE_TREASURY") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const [accounts, ledgerAccounts, currencies, members, sites] = await Promise.all([
    prisma.enterpriseFinancialAccount.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, orderBy: [{ accountType: "asc" }, { code: "asc" }], take: 500, select: { id: true, code: true, name: true, accountType: true, currencyCode: true, operationalBalance: true, availableBalance: true, status: true, revision: true } }),
    prisma.enterpriseLedgerAccount.findMany({ where: { organizationId, isActive: true, archivedAt: null, accountSubtype: { in: ["CASH", "BANK", "MOBILE_MONEY", "CLEARING"] } }, orderBy: { code: "asc" }, take: 1000, select: { id: true, code: true, nameFr: true, nameEn: true, accountType: true, accountSubtype: true, currencyCode: true } }),
    prisma.enterpriseCurrency.findMany({ where: { isActive: true, OR: [{ organizationId }, { organizationId: null }] }, orderBy: { code: "asc" }, take: 500, select: { code: true, name: true, symbol: true, precision: true } }),
    prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", removedAt: null }, orderBy: { user: { name: "asc" } }, take: 1000, select: { userId: true, role: true, positionTitle: true, user: { select: { name: true, email: true } } } }),
    prisma.enterpriseSite.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, orderBy: { name: "asc" }, take: 500, select: { id: true, code: true, name: true } }),
  ]);
  const currencyByCode = new Map<string, { code: string; name: string; symbol: string | null; precision: number }>();
  for (const currency of currencies) currencyByCode.set(currency.code, currency);
  for (const account of accounts) if (!currencyByCode.has(account.currencyCode)) currencyByCode.set(account.currencyCode, { code: account.currencyCode, name: account.currencyCode, symbol: null, precision: 2 });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "treasury-lookups" } });
  return NextResponse.json({ accounts, ledgerAccounts, currencies: [...currencyByCode.values()].sort((a, b) => a.code.localeCompare(b.code)), members: members.map((member) => ({ id: member.userId, label: member.user.name || member.user.email, email: member.user.email, role: member.role, positionTitle: member.positionTitle })), sites });
}
