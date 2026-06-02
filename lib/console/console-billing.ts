import { prisma } from "@/lib/prisma";

export async function getConsoleBillingDataset({ loadBillingDetails }: { loadBillingDetails: boolean }) {
  const payments = loadBillingDetails ? await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: true, subscription: { include: { plan: true } } },
    take: 200,
  }) : [];

  return {
    payments,
    paymentAuditItems: payments.map((payment) => ({
      id: payment.id,
      reference: payment.reference,
      userEmail: payment.user.email,
      status: payment.status,
      amount: Number(payment.amount),
      currency: payment.currency,
      planName: payment.subscription?.plan.name || null,
      createdAt: payment.createdAt.toISOString(),
    })),
  };
}
