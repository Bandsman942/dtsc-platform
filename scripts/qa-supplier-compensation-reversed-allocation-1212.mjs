import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Prisma } = require("@prisma/client");
const D = value => new Prisma.Decimal(value);
class AccountingError extends Error {
  constructor(code,status=409){super(code);this.code=code;this.status=status;}
}
const created = new Date("2026-11-05T10:00:00.000Z");
const reversed = new Date("2026-11-06T10:00:00.000Z");
const zero = D("0");
const originalLines = [
  {ledgerAccountId:"payable-ledger",businessPartyId:"party-a",transactionCurrencyCode:"CDF",
    exchangeRate:D(1),transactionAmount:D(9),functionalAmount:D(9),debit:D(9),credit:zero},
  {ledgerAccountId:"claim-ledger",businessPartyId:"party-a",transactionCurrencyCode:"CDF",
    exchangeRate:D(1),transactionAmount:D(9),functionalAmount:D(9),debit:zero,credit:D(9)},
];
const inverseLines=originalLines.map(line=>({...line,debit:line.credit,credit:line.debit}));
const allocationBase={
  id:"alloc-1",organizationId:"org-a",payableId:"payable-a",sourceType:"SUPPLIER_CLAIM_COMPENSATION",
  sourceId:"comp-a",amount:D(9),status:"REVERSED",createdByUserId:"poster",
  reversedAt:reversed,allocationDate:new Date("2026-11-04T00:00:00.000Z"),
};
const offsetBase={
  id:"comp-a",organizationId:"org-a",claimId:"claim-a",payableId:"payable-a",
  status:"REVERSED",amount:D(9),currencyCode:"CDF",
  accountingDate:new Date("2026-11-04T00:00:00.000Z"),
  postedAt:created,postedByUserId:"poster",
  reversedAt:reversed,reversedByUserId:"reverser",reversalReason:"Correct compensation in period",
  postingJournalEntryId:"journal-0",reversalJournalEntryId:"journal-1",
  targetInvoiceJournalId:"invoice-journal",payableAccountId:"payable-ledger",
  claimAccountId:"claim-ledger",claim:{supplierId:"supplier-a",currencyCode:"CDF"},
};
const entriesBase=[
  {id:"journal-0",organizationId:"org-a",status:"REVERSED",reversedAt:reversed,
    reversalOfEntryId:null,sourceEntityType:"EnterpriseSupplierClaimCompensation",
    sourceEntityId:"comp-a",postingEvent:"SUPPLIER_CLAIM_COMPENSATION_POSTED",
    totalDebit:D(9),totalCredit:D(9),functionalCurrencyCode:"CDF",
    accountingDate:new Date("2026-11-04T00:00:00.000Z"),lines:originalLines},
  {id:"journal-1",organizationId:"org-a",status:"POSTED",postedAt:reversed,reversedAt:null,
    reversalOfEntryId:"journal-0",postingEvent:"REVERSAL",
    totalDebit:D(9),totalCredit:D(9),functionalCurrencyCode:"CDF",
    accountingDate:new Date("2026-11-06T00:00:00.000Z"),lines:inverseLines},
];
const recordBase={
  organizationId:"org-a",originalEntryId:"journal-0",reversalEntryId:"journal-1",
  requestedByUserId:"reverser",approvedByUserId:"reverser",
  reason:"Correct compensation in period",
};
let state;
function reset(){
  state={allocations:[{...allocationBase}],offsets:[{...offsetBase}],
    entries:entriesBase.map(x=>({...x,lines:x.lines.map(v=>({...v}))})),
    records:[{...recordBase}],queries:[]};
}
const tx={
  enterprisePayableAllocation:{findMany:async ({where,take,orderBy})=>{
    assert.equal(where.organizationId,"org-a");assert.equal(where.payableId,"payable-a");
    assert.equal(take,101);assert.equal(orderBy.id,"asc");
    state.queries.push("allocations");
    return state.allocations;
  }},
  enterpriseSupplierClaimCompensation:{findMany:async ({where})=>{
    assert.equal(where.organizationId,"org-a");assert.equal(where.status,"REVERSED");
    assert.equal(where.payableId,"payable-a");
    state.queries.push("offsets");
    return state.offsets.filter(row => row.status === where.status && row.payableId === where.payableId && where.id.in.includes(row.id));
  }},
  enterpriseJournalEntry:{findMany:async ({where})=>{
    assert.equal(where.organizationId,"org-a");
    state.queries.push("journals");
    return state.entries;
  }},
  enterpriseJournalReversal:{findMany:async ({where})=>{
    assert.equal(where.organizationId,"org-a");
    state.queries.push("journalReversal");
    return state.records;
  }},
};
const mod={exports:{}};
const source=fs.readFileSync("lib/enterprise/accounting/supplier-compensation-reversed-allocation-proof.ts","utf8");
const js=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;
vm.runInNewContext(js,{module:mod,exports:mod.exports,
  require:name=>name==="@prisma/client"?{Prisma}:name==="@/lib/enterprise/accounting/errors"?
    {EnterpriseAccountingError:AccountingError}:require(name)},{
  filename:"supplier-compensation-reversed-allocation-proof.ts",
});
const proof=mod.exports.assertReversedSupplierCompensationAllocationsTx;
const input={organizationId:"org-a",payableId:"payable-a",invoiceId:"invoice-a",
  targetInvoiceJournalId:"invoice-journal",businessPartyId:"party-a",
  supplierId:"supplier-a",currencyCode:"CDF",payableAccountId:"payable-ledger"};
const denied = error=>error?.code==="SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED";
reset();
await proof(tx,input);
assert.deepEqual(state.queries.join(","),"allocations,offsets,journals,journalReversal");
reset();state.allocations=[];
await proof(tx,input);
assert.equal(state.queries.join(","),"allocations","Truly pristine invoice has no historical reversals");
reset();state.allocations[0].status="CONFIRMED";
await assert.rejects(proof(tx,input),denied);
assert.deepEqual(state.queries,["allocations"]);
reset();state.allocations[0].sourceType="SUPPLIER_CREDIT_NOTE";
await assert.rejects(proof(tx,input),denied);
reset();state.allocations[0].reversedAt=null;
await assert.rejects(proof(tx,input),denied);
reset();state.offsets[0].status="POSTED";
await assert.rejects(proof(tx,input),denied);
reset();state.offsets[0].claim.supplierId="other-supplier";
await assert.rejects(proof(tx,input),denied);
reset();state.entries[0].lines[0].ledgerAccountId="forged";
await assert.rejects(proof(tx,input),denied);
reset();state.entries[1].status="DRAFT";
await assert.rejects(proof(tx,input),denied);
reset();state.entries[1].reversalOfEntryId="different-journal";
await assert.rejects(proof(tx,input),denied);
reset();state.records[0].reversalEntryId="missing-inverse";
await assert.rejects(proof(tx,input),denied);
reset();state.records[0].reason="tampered";
await assert.rejects(proof(tx,input),denied);
reset();state.offsets[0].targetInvoiceJournalId="foreign-invoice";
await assert.rejects(proof(tx,input),denied);
reset();state.allocations=Array.from({length:101},(_,i)=>({...allocationBase,id:"alloc-"+i}));
await assert.rejects(proof(tx,input),denied);
reset();state.entries=[];
await assert.rejects(proof(tx,input),denied);
const caller=fs.readFileSync("lib/enterprise/accounting/supplier-return-claim-refunds.ts","utf8");
assert.ok(caller.includes("await assertReversedSupplierCompensationAllocationsTx(tx,"),
  "Target preflight must require full proof, not ignore reversed allocations");
assert.ok(!caller.includes('tx.enterprisePayableAllocation.count({ where: { organizationId, payableId } })'),
  "Unconditional allocation count would permanently block offset after domain reversal");
console.log("Reversed supplier claim compensation: pristine target or full original+opposite journal proof accepted; forged allocation, ledger, supplier, reversal and excess history rejected (isolated mocks)");
