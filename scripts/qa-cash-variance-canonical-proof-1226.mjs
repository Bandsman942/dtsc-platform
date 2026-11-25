import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { cashVarianceCanonicalProofMatches as matches } from "../lib/enterprise/accounting/cash-variance-canonical-proof.ts";
const d=value=>new Prisma.Decimal(value);
const before=new Date("2026-11-25T10:00:00Z"), after=new Date("2026-11-25T10:00:01Z");
const proof={accountId:"cash-a",currencyCode:"CDF",amount:d("5.000001"),submittedAt:before,firstBusinessDate:"2026-11-25",lastBusinessDate:"2026-11-25",transactionBusinessDate:"2026-11-25",sourceStatus:"CONFIRMED",confirmedAt:after,alreadyIncluded:false,sourceReferenceCount:1,
  transaction:{financialAccountId:"cash-a",currencyCode:"CDF",amount:d("5.000001"),direction:"INBOUND",status:"CONFIRMED",reversedAt:null,createdAt:after}};
assert.equal(matches(proof),true);
assert.equal(matches({...proof,amount:d("-5.000001"),transaction:{...proof.transaction,direction:"OUTBOUND"}}),true);
for(const mismatch of [{financialAccountId:"cash-b"},{currencyCode:"USD"},{amount:d("5.000002")},{amount:d("0")},{direction:"OUTBOUND"},{direction:"OTHER"},{status:"REVERSED"},{reversedAt:after},{createdAt:before}])assert.equal(matches({...proof,transaction:{...proof.transaction,...mismatch}}),false,JSON.stringify(mismatch));
for(const mismatch of [{amount:d("0")},{sourceStatus:"APPROVED"},{confirmedAt:null},{confirmedAt:before},{transactionBusinessDate:"2026-11-24"},{transactionBusinessDate:"2026-11-26"},{alreadyIncluded:true},{sourceReferenceCount:0},{sourceReferenceCount:2}])assert.equal(matches({...proof,...mismatch}),false,JSON.stringify(mismatch));
// No floating-point rounding may make two different sums equivalent.
assert.equal(matches({...proof,amount:d("90071992547409.000001"),transaction:{...proof.transaction,amount:d("90071992547409.000002")}}),false);
console.log("#1226 canonical cash proof: exact inbound/outbound and 19 rejection cases passed");
