import { NextResponse } from "next/server";
import { requireConsoleCapability } from "@/lib/admin-api";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.FINANCE_INVOICES_READ);
  if (access.response) return access.response;
  if (!isDtscInternalSession(access.session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "HRCFO_TRANSACTION";
  const allowedTypes = ["HRCFO_TRANSACTION", "SUBSCRIPTION_PERSONAL", "SUBSCRIPTION_ENTERPRISE"];
  if (!allowedTypes.includes(type)) return NextResponse.json({ error: "Invalid invoice type" }, { status: 400 });
  const invoices = await prisma.invoice.findMany({
    where: { invoiceType: type },
    orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
    include: { user: { select: { id: true, name: true, email: true } }, hrcfoTransaction: { select: { id: true, title: true, transactionCategory: true, status: true } } },
    take: 100,
  });
  return NextResponse.json({ invoices: invoices.map((invoice) => ({ ...invoice, amount: Number(invoice.amount) })) });
}
