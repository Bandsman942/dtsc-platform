import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    return new Response("Forbidden", { status: 403 });
  }

  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: true, subscription: { include: { plan: true } } },
    take: 5000,
  });
  const rows = [
    ["Date", "Reference", "Client", "Email", "Plan", "Montant", "Devise", "Statut", "Provider"],
    ...payments.map((payment) => [
      payment.createdAt.toISOString(),
      payment.reference,
      payment.user.name,
      payment.user.email,
      payment.subscription?.plan.name || "",
      Number(payment.amount).toFixed(2),
      payment.currency,
      payment.status,
      payment.provider,
    ]),
  ];
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dtsc-payments-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
