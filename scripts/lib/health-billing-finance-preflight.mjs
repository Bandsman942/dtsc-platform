/**
 * P0 HEALTH-05: readonly internal monetary consistency audit.
 * Never returns invoice identifiers, patient details, or payment references.
 * This does NOT certify a corresponding ERP Finance posting.
 */
export const MEDICAL_BILLING_AUDIT_CODES = Object.freeze([
  "INVALID_AMOUNT",
  "PATIENT_ALLOCATION_MISMATCH",
  "CONFIRMED_PAYMENT_SUM_MISMATCH",
  "PAID_STATUS_WITH_BALANCE",
  "PARTIAL_STATUS_INCONSISTENT",
  "CANCELLED_WITH_CONFIRMED_PAYMENT",
  "DUPLICATE_PAYMENT_REFERENCE",
  "UNRECOGNIZED_PAYMENT_STATUS",
]);

export function decimalCents(input) {
  const value = typeof input === "bigint" ? input.toString() : String(input);
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("INVALID_DECIMAL");
  const neg = value.startsWith("-");
  const unsigned = neg ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  return neg ? -cents : cents;
}

export function auditMedicalBillingRow(row) {
  const problems = new Set();
  let patient = 0n, paid = 0n, balance = 0n, total = 0n, insurance = 0n, confirmed = 0n;
  try {
    patient = decimalCents(row.patientAmount);
    paid = decimalCents(row.paidAmount);
    balance = decimalCents(row.balanceAmount);
    total = decimalCents(row.totalAmount);
    insurance = decimalCents(row.insuranceAmount);
    for (const payment of row.payments ?? []) {
      if (payment.status === "CONFIRMED") confirmed += decimalCents(payment.amount);
      else if (payment.status !== "CANCELLED") problems.add("UNRECOGNIZED_PAYMENT_STATUS");
    }
    if ([patient,paid,balance,total,insurance].some(x => x < 0n) || insurance > total) {
      problems.add("INVALID_AMOUNT");
    }
    if (patient !== total - insurance || patient !== paid + balance) {
      problems.add("PATIENT_ALLOCATION_MISMATCH");
    }
    if (confirmed !== paid) problems.add("CONFIRMED_PAYMENT_SUM_MISMATCH");
    if (row.status === "PAID" && balance !== 0n) problems.add("PAID_STATUS_WITH_BALANCE");
    if (row.status === "PARTIAL_PAID" && (paid <= 0n || balance <= 0n)) problems.add("PARTIAL_STATUS_INCONSISTENT");
    if (row.status === "CANCELLED" && confirmed > 0n) problems.add("CANCELLED_WITH_CONFIRMED_PAYMENT");
  } catch {
    problems.add("INVALID_AMOUNT");
  }
  const refs = new Set();
  for (const payment of row.payments ?? []) {
    if (payment.status !== "CONFIRMED" || !payment.paymentReference) continue;
    // References never enter the report, even when a duplicate is detected.
    if (refs.has(payment.paymentReference)) problems.add("DUPLICATE_PAYMENT_REFERENCE");
    refs.add(payment.paymentReference);
  }
  return [...problems].sort();
}
