import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { auditMedicalBillingRow, decimalCents } from "./lib/health-billing-finance-preflight.mjs";
const base = {
  status:"PARTIAL_PAID",patientAmount:"100.00",totalAmount:"130.00",insuranceAmount:"30.00",
  paidAmount:"60.00",balanceAmount:"40.00",
  payments:[{status:"CONFIRMED",amount:"40.00",paymentReference:"FAKE_TX_A"},
            {status:"CONFIRMED",amount:"20.00",paymentReference:"FAKE_TX_B"}],
};
assert.equal(decimalCents("0.01"),1n);
assert.equal(decimalCents("-12.34"),-1234n);
assert.equal(decimalCents("100000000000.00"),10000000000000n);
assert.throws(()=>decimalCents("1.234"),/INVALID_DECIMAL/);
assert.deepEqual(auditMedicalBillingRow(base),[]);
assert.ok(auditMedicalBillingRow({...base,paidAmount:"61.00"}).includes("CONFIRMED_PAYMENT_SUM_MISMATCH"));
assert.ok(auditMedicalBillingRow({...base,balanceAmount:"41.00"}).includes("PATIENT_ALLOCATION_MISMATCH"));
assert.ok(auditMedicalBillingRow({...base,status:"PAID"}).includes("PAID_STATUS_WITH_BALANCE"));
assert.ok(auditMedicalBillingRow({...base,status:"CANCELLED"}).includes("CANCELLED_WITH_CONFIRMED_PAYMENT"));
assert.ok(auditMedicalBillingRow({...base,insuranceAmount:"131.00"}).includes("INVALID_AMOUNT"));
assert.ok(auditMedicalBillingRow({...base,paidAmount:"0",status:"PARTIAL_PAID"}).includes("PARTIAL_STATUS_INCONSISTENT"));
assert.ok(auditMedicalBillingRow({...base,payments:[...base.payments,{status:"CONFIRMED",amount:"0.01",paymentReference:"FAKE_TX_A"}]}).includes("DUPLICATE_PAYMENT_REFERENCE"));
assert.ok(auditMedicalBillingRow({...base,payments:[{status:"UNKNOWN",amount:"1"}]}).includes("UNRECOGNIZED_PAYMENT_STATUS"));
const source=readFileSync("scripts/health-billing-finance-preflight.mjs","utf8");
assert.match(source,/READ_ONLY_HEALTH_BILLING_AUDIT/);
assert.match(source,/where:\{organizationId,/,"Always filter tenant");
assert.match(source,/financePostingVerified:false/,"No false Finance certification");
assert.match(source,/nextOffset:offset\+totals\.scanned/,"Bounded continuation");
assert.doesNotMatch(source,/\.(create|update|delete|upsert|executeRaw)\(/, "Preflight must be structurally readonly");
assert.doesNotMatch(source,/console\.log\(.*(row|patient|invoiceId|paymentReference)/,"Never print PHI or refs");
console.log("PASS HEALTH-05 finance preflight: decimal invariants, tenant guard and strict readonly contract.");
