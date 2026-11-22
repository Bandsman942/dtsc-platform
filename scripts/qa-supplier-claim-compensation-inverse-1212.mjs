import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Prisma } = require("@prisma/client");
const decimal = value => new Prisma.Decimal(value);

class AccountingError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
const original = {
  id:"comp-1", organizationId:"org-a", claimId:"claim-1", payableId:"payable-1",
  status:"POSTED", revision:4, currencyCode:"CDF", amount:decimal("9.000000"),
  accountingDate:new Date("2026-11-04T00:00:00.000Z"),
  postedAt:new Date("2026-11-05T09:00:00.000Z"), postedByUserId:"poster",
  approvedAt:new Date("2026-11-05T08:00:00.000Z"), approvedByUserId:"approver",
  approverUserId:"approver", requestedByUserId:"requester", submittedAt:new Date("2026-11-04T11:00:00.000Z"),
  postingJournalEntryId:"journal-1", reversedAt:null, reversedByUserId:null,
  reversalReason:null, reversalJournalEntryId:null,
};
const payableBase = {
  id:"payable-1", organizationId:"org-a", supplierInvoiceId:"invoice-1", supplierId:"supplier",
  businessPartyId:"party", currencyCode:"CDF", originalAmount:decimal("20"),
  allocatedAmount:decimal("0"), creditedAmount:decimal("5"), compensatedAmount:decimal("9"),
  outstandingAmount:decimal("6"), status:"OPEN",
};
const invoiceBase = {
  id:"invoice-1", organizationId:"org-a", supplierId:"supplier", businessPartyId:"party",
  currencyCode:"CDF", grandTotal:decimal("20"), amountPaid:decimal("0"),
  amountCredited:decimal("5"), amountCompensated:decimal("9"), outstandingAmount:decimal("6"),
  status:"POSTED",
};
const allocationBase = {
  id:"allocation-1", payableId:"payable-1", amount:decimal("9"), status:"CONFIRMED",
  reversedAt:null, allocationDate:new Date("2026-11-04T00:00:00.000Z"), createdByUserId:"poster",
};
const entryBase = {
  id:"journal-1", status:"POSTED", sourceEntityType:"EnterpriseSupplierClaimCompensation",
  sourceEntityId:"comp-1", postingEvent:"SUPPLIER_CLAIM_COMPENSATION_POSTED",
  reversedAt:null, reversalOfEntryId:null, totalDebit:decimal("9"), totalCredit:decimal("9"),
  accountingDate:new Date("2026-11-04T00:00:00.000Z"),
};
let state;
function reset() {
  state = {
    comp:{...original}, payable:{...payableBase}, invoice:{...invoiceBase},
    allocation:{...allocationBase}, journal:{...entryBase}, events:[],
    calls:[], periodOpen:true, proofValid:true, reversalFailure:false,
    journalReversals:0,
  };
}
const tx = {
  $queryRaw:async () => { state.calls.push("LOCK"); return []; },
  enterpriseSupplierClaimCompensation:{
    findFirst:async ({where}) => {
      assert.equal(where.organizationId,"org-a");
      return where.id==="comp-1" ? {...state.comp} : null;
    },
    update:async ({where,data}) => {
      assert.equal(where.organizationId_id.organizationId,"org-a");
      assert.equal(where.organizationId_id.id,"comp-1");
      assert.equal(data.status,"REVERSED");
      state.comp={...state.comp,...data,revision:state.comp.revision+1};
      state.calls.push("COMP_REVERSED");
      return {...state.comp};
    },
  },
  enterprisePayable:{
    findFirst:async ({where,select}) => {
      assert.equal(where.organizationId,"org-a");
      if(where.id!=="payable-1")return null;
      return select ? {supplierInvoiceId:"invoice-1"} : {...state.payable};
    },
    update:async ({where,data}) => {
      assert.equal(where.id,"payable-1");
      state.payable={...state.payable,...data};
      state.calls.push("PAYABLE_RESTORED");
      return {...state.payable};
    },
  },
  enterpriseSupplierInvoice:{
    findFirst:async ({where}) => {
      assert.equal(where.organizationId,"org-a");
      return where.id==="invoice-1"?{...state.invoice}:null;
    },
    update:async ({where,data}) => {
      assert.equal(where.id,"invoice-1");
      state.invoice={...state.invoice,...data,revision:2};
      state.calls.push("INVOICE_RESTORED");
      return {...state.invoice};
    },
  },
  enterprisePayableAllocation:{
    findMany:async ({where}) => {
      assert.equal(where.organizationId,"org-a");
      assert.equal(where.sourceType,"SUPPLIER_CLAIM_COMPENSATION");
      assert.equal(where.sourceId,"comp-1");
      return [{...state.allocation}];
    },
    update:async ({where,data}) => {
      assert.equal(where.id,"allocation-1");
      state.allocation={...state.allocation,...data};
      state.calls.push("ALLOCATION_REVERSED");
      return {...state.allocation};
    },
  },
  enterpriseJournalEntry:{
    findFirst:async ({where}) => {
      assert.equal(where.organizationId,"org-a");
      if(where.id==="journal-1")return {...state.journal};
      if(where.id==="journal-reversed")return {
        accountingDate:new Date("2026-11-06T00:00:00.000Z"),
        reversalOfEntryId:"journal-1",status:"POSTED",
      };
      return null;
    },
  },
};
const mocks={
  "@prisma/client":{Prisma},
  "@/lib/prisma":{prisma:{$transaction:async (cb,options)=>{
    assert.equal(options.isolationLevel,Prisma.TransactionIsolationLevel.Serializable);
    return cb(tx);
  }}},
  "@/lib/enterprise/accounting/access":{assertIndependentActor:({actorUserId,relatedUserIds,errorCode})=>{
    if(relatedUserIds.includes(actorUserId))throw new AccountingError(errorCode);
  }},
  "@/lib/enterprise/accounting/errors":{EnterpriseAccountingError:AccountingError},
  "@/lib/enterprise/accounting/helpers":{publishFinanceEvent:async (_tx,event)=>{
    assert.equal(event.organizationId,"org-a");
    assert.equal(event.eventType,"SUPPLIER_CLAIM_COMPENSATION_REVERSED");
    assert.equal(event.metadataJson.treasuryImpact,"0");
    state.events.push(event);
  }},
  "@/lib/enterprise/accounting/periods":{getPostingPeriod:async ()=>{
    if(!state.periodOpen)throw new AccountingError("FINANCE_PERIOD_CLOSED");
    return {id:"open-period"};
  }},
  "@/lib/enterprise/accounting/reversal-service":{reverseJournalEntryTx:async (_tx,org,id,actor,input,opts)=>{
    assert.equal(org,"org-a");assert.equal(id,"journal-1");
    assert.equal(actor,"independent");assert.equal(opts.authorization,"DOMAIN_INVERSE");
    assert.equal(input.accountingDate.toISOString(),"2026-11-06T00:00:00.000Z");
    state.calls.push("JOURNAL_REVERSED");state.journalReversals++;
    if(state.reversalFailure)throw new AccountingError("JOURNAL_REVERSAL_FAILED");
    return {id:"journal-reversed"};
  }},
  "@/lib/enterprise/accounting/supplier-claim-compensation-service":{assertSupplierCompensationScopeTx:async (_tx,org)=>{
    assert.equal(org,"org-a");
  }},
  "@/lib/enterprise/accounting/supplier-return-claim-refunds":{
    lockSupplierClaimRefundTx:async (_tx,org,id)=>{
      assert.equal(org,"org-a");assert.equal(id,"claim-1");state.calls.push("LOCK_CLAIM");
    },
    readSupplierClaimRefundEvidenceTx:async ()=>{
      if(!state.proofValid)throw new AccountingError("SUPPLIER_RETURN_REFUND_EVIDENCE_REQUIRED");
      return {claim:{supplierId:"supplier"},invoice:{businessPartyId:"party"}};
    },
  },
  "@/lib/enterprise/accounting/supplier-return-credit-reconciliation":{
    lockSupplierReturnInvoiceTx:async (_tx,org,id)=>{
      assert.equal(org,"org-a");assert.equal(id,"invoice-1");state.calls.push("LOCK_INVOICE");
    },
  },
  "@/lib/enterprise/enterprise-activity-civil-date":{
    isValidEnterpriseActivityCivilDate:v=>/^\d{4}-\d{2}-\d{2}$/.test(v),
  },
};
const module={exports:{}};
const source=fs.readFileSync("lib/enterprise/accounting/supplier-claim-compensation-inverse.ts","utf8");
const js=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;
vm.runInNewContext(js,{module,exports:module.exports,require:name=>mocks[name]||require(name),Date},
  {filename:"supplier-claim-compensation-inverse.ts"});
const {reversePostedSupplierClaimCompensation:reverse}=module.exports;
const input={compensationId:"comp-1",revision:4,reason:"Accounting correction required",accountingDate:"2026-11-06"};

reset();
let value=await reverse("org-a","independent",input);
assert.equal(value.status,"REVERSED");
assert.equal(value.revision,5);
assert.equal(value.reversalJournalEntryId,"journal-reversed");
assert.equal(state.payable.compensatedAmount.toFixed(),"0");
assert.equal(state.payable.outstandingAmount.toFixed(),"15");
assert.equal(state.payable.status,"OPEN");
assert.equal(state.invoice.amountCompensated.toFixed(),"0");
assert.equal(state.invoice.outstandingAmount.toFixed(),"15");
assert.equal(state.invoice.status,"POSTED");
assert.equal(state.allocation.status,"REVERSED");
assert.ok(state.allocation.reversedAt);
assert.equal(state.events.length,1);
assert.equal(state.journalReversals,1);
assert.ok(state.calls.indexOf("JOURNAL_REVERSED") < state.calls.indexOf("PAYABLE_RESTORED"));
assert.ok(!state.calls.some(v=>/PAYMENT|TREASURY|CASH/.test(v)));

value=await reverse("org-a","independent",input);
assert.equal(value.status,"REVERSED");
assert.equal(state.journalReversals,1,"Idempotent retry must not reverse journal twice");
assert.equal(state.events.length,1);

for(const actor of ["requester","approver","poster"]){
  reset();
  await assert.rejects(reverse("org-a",actor,input),error=>
    error.code==="SUPPLIER_RETURN_COMPENSATION_SELF_INVERSE_FORBIDDEN");
  assert.equal(state.journalReversals,0);
}
reset();state.periodOpen=false;
await assert.rejects(reverse("org-a","independent",input),error=>error.code==="FINANCE_PERIOD_CLOSED");
assert.equal(state.journalReversals,0);
reset();state.proofValid=false;
await assert.rejects(reverse("org-a","independent",input),error=>error.code==="SUPPLIER_RETURN_REFUND_EVIDENCE_REQUIRED");
assert.equal(state.journalReversals,0);
reset();state.invoice.amountCompensated=decimal("8");
await assert.rejects(reverse("org-a","independent",input),error=>error.code==="SUPPLIER_RETURN_COMPENSATION_INVERSE_CONFLICT");
assert.equal(state.journalReversals,0);
reset();state.allocation.status="REVERSED";
await assert.rejects(reverse("org-a","independent",input),error=>error.code==="SUPPLIER_RETURN_COMPENSATION_INVERSE_CONFLICT");
assert.equal(state.journalReversals,0);
reset();state.reversalFailure=true;
await assert.rejects(reverse("org-a","independent",input),error=>error.code==="JOURNAL_REVERSAL_FAILED");
assert.equal(state.calls.includes("PAYABLE_RESTORED"),false);
assert.equal(state.calls.includes("COMP_REVERSED"),false);
reset();
await assert.rejects(reverse("org-a","independent",{...input,accountingDate:"2026-11-01"}),error=>
  error.code==="SUPPLIER_RETURN_COMPENSATION_INVERSE_CONFLICT");
assert.equal(state.journalReversals,0);

const sql=fs.readFileSync("prisma/migrations/20261122100000_supplier_claim_compensation_domain_inverse/migration.sql","utf8");
for(const fragment of ["ADD COLUMN \"reversedAt\"","'POSTED' AND NEW.\"status\" = 'REVERSED'",
  "supplier_comp_no_ghost_decision","supplier_comp_reversal_journal_key",
  "AND \"reversalJournalEntryId\" IS NOT NULL"])assert.ok(sql.includes(fragment));
const api=fs.readFileSync("app/api/enterprise/[organizationId]/payables/route.ts","utf8");
for(const fragment of ['REVERSE_COMPENSATION','data.action === "REVERSE_COMPENSATION" ? "reverse"','reversePostedSupplierClaimCompensation',
  'SUPPLIER_CLAIM_COMPENSATION_REVERSED'])assert.ok(api.includes(fragment),fragment);
const generic=fs.readFileSync("lib/enterprise/accounting/reversal-service.ts","utf8");
assert.ok(generic.includes('options?.authorization !== "DOMAIN_INVERSE"'));
console.log("Supplier compensation domain inverse: restored payable/invoice, immutable allocation, zero cash, separate actor, open period, idempotence and failure rollback guards OK (isolated mocks)");
