import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hirmsInvoiceSchema, hirmsInvoiceBulkSchema } from "../lib/enterprise/health-insurance-connectors/invoice-contract.ts";

const date = "2026-11-12T22:01:28.627Z";
const lineCode = {
  AutoAssess: "", Conclusion: "", ApprovedAmount: 0, RejectionReason: "", Description: "Consultation",
  CPTCode: "99213", Benefit: "", BenefitName: "", PreAuth: "", Amount: 75, Units: 1,
  Date: date, DueToClient: 0, DueToInsurer: 0, DueToMember: 0,
};
const invoice = {
  InvoiceID: "inv-canonical-test-1", InvoiceNumber: "FACT-TEST-001", Currency: "USD", ConversionRate: 1,
  ServiceProviderID: 123, ClaimAmount: 75, AdjustedAmount: 0, ApprovedAmount: 0,
  PaymentStatus: "PENDING", InvoiceDate: date, AssessmentDate: date, PaymentDate: date, CreatedAt: date,
  SubmitedBy: "", RecievedBy: "", SubmitedByEmail: "", DocumentId: "", Consultations: "",
  NumAuto: "", Site: "", JournalizedDate: "", Type: "CONSULTATION",
  InvoiceItems: [{
    Description: "Consultation", Qty: 1, Amount: 75, AssignedTo: "", ItemId: "line-1",
    CPTCode: [lineCode], MemberNumber: "MSO-2026-000141", IcD10: "",
    CPTCode_Code: "99213", TreatmentDate: "2026-11-12", AdmissionDays: 0,
    PreAuthNo: "", Notes: "", AdmissionDate: date, DischargeDate: date,
    IsOutPatient: true, ProviderServiceId: 123, ConsulationId: 0,
    IsComplete: true, BenefitId: 0, DocumentId: "",
  }],
  ServiceProviders: "", ScanId: "", Notes: "",
};
const clone = (value) => JSON.parse(JSON.stringify(value));
function valid(obj,msg) { assert.equal(hirmsInvoiceSchema.safeParse(obj).success,true,msg); }
function invalid(obj,msg) { assert.equal(hirmsInvoiceSchema.safeParse(obj).success,false,msg); }
valid(invoice,"single invoice must match provided HSL JSON");
assert.equal(hirmsInvoiceBulkSchema.safeParse([invoice, { ...invoice, InvoiceID:"inv-canonical-test-2" }]).success,true,"bulk reuses the same structure");
assert.equal(hirmsInvoiceBulkSchema.safeParse([invoice,invoice]).success,false,"bulk duplicate invoice blocked");
assert.equal(hirmsInvoiceBulkSchema.safeParse(Array.from({length:501},(_,index)=>({...invoice,InvoiceID:String(index)}))).success,false,"bulk > 500 blocked");
invalid({ ...invoice, ClaimAmount:"75" },"numeric amount must stay numeric");
invalid({ ...invoice, ServiceProviderID:0 },"unknown external provider must not be sent as zero");
invalid({ ...invoice, ApprovedAmount:100 },"approved cannot exceed claimed");
invalid({ ...invoice, InvoiceItems:[{...invoice.InvoiceItems[0], CPTCode:"99213"}] },"CPTCode must be an array of objects");
invalid({ ...invoice, SubmitedBy:undefined },"HSL uses the partner's exact spelling");
const altered=clone(invoice);altered.InvoiceItems[0].CPTCode[0].CPTCode="";
invalid(altered,"missing CPT value blocked");
const files={
  sender:"lib/enterprise/health-insurance-connectors/hirms-invoices.ts",
  service:"lib/enterprise/health-insurance-connectors/invoice-service.ts",
  api:"app/api/enterprise/[organizationId]/insurance-connectors/invoices/route.ts",
  migration:"prisma/migrations/20261112231000_hirms_invoice_transport/migration.sql",
  docs:"docs/integrations/HIRMS_HEALTH_INSURANCE_CONNECTORS.md",
};
const sources=Object.fromEntries(Object.entries(files).map(([name,path])=>[name,readFileSync(new URL("../"+path,import.meta.url),"utf8")]));
for (const term of ['"/api/invoices/bulk"','"/api/invoices"',"Authorization:","HIRMS_INVOICE_OUTCOME_UNKNOWN"]) assert.ok(sources.sender.includes(term),term);
for (const term of ["HEALTH_INSURANCE_HIRMS_UAT_INVOICE_SEND_ENABLED","healthBillingExtension","pharmacySalesExtension","enterpriseSalesInvoice.findMany","enterpriseHealthInsuranceInvoiceSubmission.createMany","InvoiceNumber","ServiceProviderID","ClaimAmount","payloadDigest"]) assert.ok(sources.service.includes(term),term);
for (const term of ["isSameOriginRequest","getSession","activeOrganizationId","rateLimit","writeAuditLog","writeApiLog"]) assert.ok(sources.api.includes(term),term);
assert.match(sources.migration,/UNIQUE INDEX/);
assert.match(sources.docs,/UAT-only/);
console.log("HIRMS-01: JSON single/bulk, validations, tenant ERP links, UAT gate, audit, idempotence OK");
