import fs from "node:fs";

const failures = [];
const fail = (message) => failures.push(message);
const read = (path) => fs.readFileSync(path, "utf8");

const payments = read("lib/enterprise/accounting/payments-service.ts");
const http = read("lib/enterprise/accounting/http.ts");
const gaming = read("lib/enterprise/module-registry-gaming.json");
const convergence = read("lib/enterprise/module-registry-sector-convergence.json");
const tailoring = read("lib/enterprise/module-registry-tailoring.json");

const requireTokens = (source, tokens, label) => {
  for (const token of tokens) if (!source.includes(token)) fail(`${label}: missing ${token}`);
};

requireTokens(payments, [
  "postBusinessEventTx",
  "reverseJournalEntryTx",
  'if (!cashSession) throw new EnterpriseAccountingError("OPEN_CASH_SESSION_REQUIRED", 409)',
  "payment.approvedByUserId",
  "PAYMENT_TREASURY_TRANSACTION_MISSING",
  "PAYMENT_TREASURY_TRANSACTION_INCONSISTENT",
  "PAYMENT_CASH_MOVEMENT_INCONSISTENT",
  "PAYMENT_JOURNAL_INCONSISTENT",
  "originalSignedAmount.negated()",
  'movementType: `${movement.movementType}_REVERSAL`',
  'authorization: "DOMAIN_INVERSE"',
  "maxWait: 10000",
  "timeout: 30000",
], "canonical payment integrity");

if (payments.includes('import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";')) {
  fail("payment confirmation must not post in a second transaction");
}
if (payments.includes("cashSessionId = cashSession?.id || null")) {
  fail("new CASH payments must not persist without an OPEN cash session");
}

requireTokens(http, [
  "PAYMENT_TREASURY_TRANSACTION_MISSING",
  "différente de l’initiateur et du validateur",
], "safe client errors");

requireTokens(gaming, [
  '"FINANCE_RECEIVABLES"',
  '"FINANCE_PAYMENTS"',
  '"FINANCE_TREASURY"',
  '"FINANCE_CASH"',
], "Gaming common Finance convergence");

requireTokens(convergence, [
  '"CASH_INVOICES_PAYMENTS"',
  '"FINANCE_RECEIVABLES"',
  '"FINANCE_PAYMENTS"',
  '"FINANCE_CASH"',
  '"MEDICAL_BILLING"',
], "Health/Pharmacy common Finance convergence");

if (tailoring.includes("GamingPayment") || tailoring.includes("PharmacyPayment") || tailoring.includes("HealthMedicalInvoicePayment")) {
  fail("Tailoring registry must not introduce a sector payment source");
}

if (failures.length) {
  console.error("FAIL #730 Finance payment integrity:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log("PASS #730 Finance payment integrity, maker/checker/settler, atomic posting and cross-sector canonical contracts.");
