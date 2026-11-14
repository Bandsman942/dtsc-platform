/**
 * PAY-4 #1170: read-only reconciliation preflight for subscribed provider payments.
 * It does not verify a PSP settlement or the physical bank account.
 */
export const PROVIDER_PREFLIGHT_CODES = Object.freeze([
  "PAYMENT_REFERENCE_MISSING",
  "INVOICE_MISSING",
  "INVOICE_INCOME_LINK_MISMATCH",
  "MISSING_INCOME",
  "DUPLICATE_INCOME",
  "SYNTHETIC_ACCOUNT",
  "UNVERIFIED_FINANCIAL_ACCOUNT",
  "MISMATCHED_CURRENCY",
  "MISMATCHED_AMOUNT",
  "INVALID_MONEY_AMOUNT",
  "MISSING_PAID_TIMESTAMP",
]);

export function cents(value) {
  const valueString = String(value);
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(valueString)) throw new Error("INVALID_MONEY_AMOUNT");
  const isNegative = valueString[0] === "-";
  const [whole, decimals=""] = (isNegative?valueString.slice(1):valueString).split(".");
  const n=BigInt(whole)*100n+BigInt(decimals.padEnd(2,"0")||"0");
  return isNegative?-n:n;
}

export function inspectProviderSettlement(payment, transactions=[]) {
  const findings=new Set();
  if (!payment.providerReference) findings.add("PAYMENT_REFERENCE_MISSING");
  if (!payment.paidAt) findings.add("MISSING_PAID_TIMESTAMP");
  if (!payment.invoice) findings.add("INVOICE_MISSING");
  if (transactions.length===0) findings.add("MISSING_INCOME");
  if (transactions.length>1) findings.add("DUPLICATE_INCOME");
  if (payment.invoice?.hrcfoTransactionId &&
      !transactions.some(x=>x.id===payment.invoice.hrcfoTransactionId)) findings.add("INVOICE_INCOME_LINK_MISMATCH");
  if (payment.invoice && !payment.invoice.hrcfoTransactionId && transactions.length>0) findings.add("INVOICE_INCOME_LINK_MISMATCH");
  for (const trx of transactions) {
    const account=trx.account;
    if (!account || account.status!=="ACTIVE" || account.reconciliationIssue || !account.currency) {
      findings.add("UNVERIFIED_FINANCIAL_ACCOUNT");
    }
    if (account?.name?.startsWith("Encaissements abonnements ·")) findings.add("SYNTHETIC_ACCOUNT");
    if (String(trx.currency).toUpperCase()!==String(payment.currency).toUpperCase() ||
        (account?.currency && String(account.currency).toUpperCase()!==String(payment.currency).toUpperCase())) {
      findings.add("MISMATCHED_CURRENCY");
    }
    try {
      if (cents(trx.amount)!==cents(payment.amount)) findings.add("MISMATCHED_AMOUNT");
    } catch {
      findings.add("INVALID_MONEY_AMOUNT");
    }
  }
  return [...findings].sort();
}
