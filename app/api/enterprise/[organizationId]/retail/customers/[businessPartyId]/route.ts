import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { getRetailCustomerPaymentPermissions } from "@/lib/enterprise/retail/permissions";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; businessPartyId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, businessPartyId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  if (!permissions.canReadCustomers) return NextResponse.json({ error: "Forbidden", message: "Votre fonction ne permet pas de consulter l’historique client Retail." }, { status: 403 });

  try {
    const customer = await prisma.enterpriseBusinessParty.findFirst({
      where: {
        id: businessPartyId,
        organizationId,
        status: "ACTIVE",
        archivedAt: null,
        roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } },
      },
      select: { id: true, code: true, legalName: true, displayName: true, partyType: true, createdAt: true },
    });
    if (!customer) return NextResponse.json({ error: "RETAIL_CUSTOMER_NOT_FOUND" }, { status: 404 });

    const [profile, sales, returns, loyaltyAccounts, storedValueAccounts] = await Promise.all([
      prisma.enterpriseRetailCustomerProfile.findFirst({ where: { organizationId, businessPartyId, archivedAt: null } }),
      prisma.enterpriseRetailSale.findMany({
        where: { organizationId, customerBusinessPartyId: businessPartyId },
        orderBy: { soldAt: "desc" },
        take: 50,
        select: {
          id: true,
          number: true,
          status: true,
          currencyCode: true,
          grandTotal: true,
          soldAt: true,
          siteId: true,
          lines: { select: { id: true, description: true, quantity: true, lineTotal: true } },
        },
      }),
      prisma.enterpriseRetailReturn.findMany({
        where: { organizationId, sale: { customerBusinessPartyId: businessPartyId } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, number: true, saleId: true, status: true, currencyCode: true, grandTotal: true, createdAt: true, completedAt: true, refundMethod: true },
      }),
      prisma.enterpriseRetailLoyaltyAccount.findMany({
        where: { organizationId, customerBusinessPartyId: businessPartyId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, programId: true, pointsBalance: true, lifetimeEarned: true, lifetimeRedeemed: true, tierCode: true, status: true, updatedAt: true, program: { select: { code: true, nameFr: true, nameEn: true, currencyCode: true, status: true } } },
      }),
      prisma.enterpriseRetailStoredValueAccount.findMany({
        where: { organizationId, customerBusinessPartyId: businessPartyId, archivedAt: null },
        orderBy: { updatedAt: "desc" },
        select: { id: true, accountType: true, displayCode: true, currencyCode: true, balance: true, status: true, expiresAt: true, updatedAt: true },
      }),
    ]);

    const salesTotalByCurrency = sales.reduce<Record<string, number>>((acc, sale) => {
      acc[sale.currencyCode] = (acc[sale.currencyCode] || 0) + Number(sale.grandTotal);
      return acc;
    }, {});
    const returnsTotalByCurrency = returns.reduce<Record<string, number>>((acc, item) => {
      acc[item.currencyCode] = (acc[item.currencyCode] || 0) + Number(item.grandTotal);
      return acc;
    }, {});

    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-customers", action: "history", businessPartyId, saleCount: sales.length, returnCount: returns.length } });
    return NextResponse.json({
      customer,
      retailProfile: profile,
      summary: { saleCount: sales.length, returnCount: returns.length, salesTotalByCurrency, returnsTotalByCurrency },
      sales,
      returns,
      loyaltyAccounts,
      storedValueAccounts,
    });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_CUSTOMER_HISTORY_LOAD_FAILED");
  }
}
