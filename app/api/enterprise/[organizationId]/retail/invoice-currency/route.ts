import { NextResponse } from "next/server";
import { authorizeRetailRequest } from "@/lib/enterprise/retail/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

/** Minimal scoped retail read; POS operators do not need general Finance access
 * to discover the company's configured invoice currency. */
export async function GET(req: Request, { params }: Params) {
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const configuration = await prisma.enterpriseFinanceConfiguration.findUnique({
    where: { organizationId }, select: { functionalCurrencyCode: true },
  });
  if (!configuration?.functionalCurrencyCode) {
    return NextResponse.json({ error: "FINANCE_CONFIGURATION_REQUIRED",
      message: "Configurez d'abord la devise fonctionnelle de l'entreprise dans Finance." }, { status: 409 });
  }
  return NextResponse.json({ currencyCode: configuration.functionalCurrencyCode }, { headers: { "Cache-Control": "private, no-store" } });
}
