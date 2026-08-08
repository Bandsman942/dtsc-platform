import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest } from "@/lib/enterprise/retail/http";
import { getRetailCustomerPaymentPermissions } from "@/lib/enterprise/retail/permissions";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "dtsc-retail-customer";
type Params = { params: Promise<{ organizationId: string }> };

function cookieValue(organizationId: string, customerId: string) {
  return `${organizationId}:${customerId}`;
}

function customerIdFromCookie(req: Request, organizationId: string) {
  const header = req.headers.get("cookie") || "";
  const value = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!value) return null;
  const decoded = decodeURIComponent(value);
  const prefix = `${organizationId}:`;
  return decoded.startsWith(prefix) ? decoded.slice(prefix.length) || null : null;
}

async function getCustomer(organizationId: string, customerId: string | null) {
  if (!customerId) return null;
  const party = await prisma.enterpriseBusinessParty.findFirst({
    where: { id: customerId, organizationId, status: "ACTIVE", archivedAt: null, roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } } },
    select: { id: true, code: true, legalName: true, displayName: true, primaryEmail: true, primaryPhone: true },
  });
  if (!party) return null;
  const profile = await prisma.enterpriseRetailCustomerProfile.findFirst({
    where: { organizationId, businessPartyId: party.id, archivedAt: null },
    select: { customerNumber: true, segmentCode: true, priceListCode: true, preferredLocale: true, preferredCurrencyCode: true, status: true },
  });
  return { ...party, retailProfile: profile };
}

function clearCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  if (!permissions.canReadCustomers) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const customer = await getCustomer(organizationId, customerIdFromCookie(req, organizationId));
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-active-customer", action: "get", selected: Boolean(customer) } });
  const response = NextResponse.json({ customer });
  return customer ? response : clearCookie(response);
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 300 });
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  if (!permissions.canReadCustomers) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const raw = await req.json().catch(() => null) as { customerBusinessPartyId?: unknown } | null;
  const customerId = typeof raw?.customerBusinessPartyId === "string" ? raw.customerBusinessPartyId.trim() : "";
  if (!customerId) return NextResponse.json({ error: "Invalid payload", message: "Sélectionnez un client." }, { status: 400 });
  const customer = await getCustomer(organizationId, customerId);
  if (!customer) return NextResponse.json({ error: "RETAIL_CUSTOMER_INVALID", message: "Le client sélectionné n’est pas actif dans cette entreprise." }, { status: 409 });
  const response = NextResponse.json({ ok: true, customer });
  response.cookies.set(COOKIE_NAME, cookieValue(organizationId, customer.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 60 * 60 });
  await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_ACTIVE_CUSTOMER_SELECTED", entity: "EnterpriseBusinessParty", entityId: customer.id, request: req, metadata: { organizationId } });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-active-customer", action: "select" } });
  return response;
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 300 });
  if (!auth.ok) return auth.response;
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-active-customer", action: "clear" } });
  return clearCookie(NextResponse.json({ ok: true, customer: null }));
}

export { customerIdFromCookie };
