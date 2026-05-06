import { env, requireEnv } from "@/lib/env";

export type MaishaPayProvider = "MPESA" | "ORANGE" | "AIRTEL" | "AFRICEL" | "MTN";

export function isMaishaPayConfigured() {
  return Boolean(env.MAISHAPAY_PUBLIC_API_KEY && env.MAISHAPAY_SECRET_API_KEY);
}

export async function initiateMaishaPayPayment({
  transactionReference,
  amount,
  currency,
  customerFullName,
  customerPhoneNumber,
  customerEmailAddress,
  provider,
  walletId,
}: {
  transactionReference: string;
  amount: number;
  currency: string;
  customerFullName: string;
  customerPhoneNumber?: string | null;
  customerEmailAddress?: string | null;
  provider: MaishaPayProvider;
  walletId: string;
}) {
  const endpoint = env.MAISHAPAY_API_URL || "https://marchand.maishapay.online/api/payment/rest/vers1.0/merchant";
  const payload = {
    gatewayMode: env.MAISHAPAY_GATEWAY_MODE,
    publicApiKey: requireEnv("MAISHAPAY_PUBLIC_API_KEY"),
    secretApiKey: requireEnv("MAISHAPAY_SECRET_API_KEY"),
    transactionReference,
    amount,
    currency,
    customerFullName,
    customerPhoneNumber: customerPhoneNumber || walletId,
    customerEmailAddress: customerEmailAddress || null,
    chanel: "MOBILEMONEY",
    provider,
    walletID: walletId,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));

  if (!response.ok) {
    throw new Error(`MaishaPay failed with status ${response.status}`);
  }

  return { payload, data };
}

export function getMaishaPayProviderReference(response: unknown) {
  const data = response as {
    original?: { data?: { transactionId?: string; originatingTransactionId?: string } };
    transactionId?: string;
    originatingTransactionId?: string;
  };

  return data.original?.data?.transactionId || data.transactionId || data.original?.data?.originatingTransactionId || null;
}
