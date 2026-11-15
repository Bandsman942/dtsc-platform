import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  isAuthorizedMaishaPayCallback,
  readVerifiedMaishaPayEvent,
  validateMaishaPayPaymentEvidence,
} from "../lib/payments/maishapay-callback-validation.ts";

if(!/^postgres(ql)?:\/\/[^/]*(@localhost|@127\.0\.0\.1)(:|\/)/i.test(process.env.DATABASE_URL||"")) {
  throw new Error("ISOLATED_LOCAL_POSTGRES_REQUIRED");
}
const db=new PrismaClient();
const suffix=randomUUID().replaceAll("-","");
const userId="qa1176-user-"+suffix;
const orgA="qa1176-orgA-"+suffix,orgB="qa1176-orgB-"+suffix;
const payA="qa1176-paymentA-"+suffix,payB="qa1176-paymentB-"+suffix;
try {
  await db.user.create({data:{id:userId,name:"QA_FAKE_USER",email:"qa1176-"+suffix+"@example.invalid",passwordHash:"QA_ONLY"}});
  await db.organization.createMany({data:[
    {id:orgA,name:"QA_FAKE_TENANT_A",status:"ACTIVE"},
    {id:orgB,name:"QA_FAKE_TENANT_B",status:"ACTIVE"},
  ]});
  await db.payment.createMany({data:[
    {id:payA,userId,organizationId:orgA,provider:"MAISHAPAY",reference:"QA1176-REF-A-"+suffix,
      providerReference:"QA1176-PROVIDER-A",amount:"30.00",currency:"USD",status:"PENDING"},
    {id:payB,userId,organizationId:orgB,provider:"MAISHAPAY",reference:"QA1176-REF-B-"+suffix,
      providerReference:"QA1176-PROVIDER-B",amount:"50.00",currency:"CDF",status:"PENDING"},
  ]});
  const a=await db.payment.findUniqueOrThrow({
    where:{id:payA},
    select:{provider:true,providerReference:true,amount:true,currency:true,status:true},
  });
  assert.equal(validateMaishaPayPaymentEvidence({amount:"30.00",currency:"USD",transactionId:"QA1176-PROVIDER-A"},a),null);
  assert.equal(validateMaishaPayPaymentEvidence({amount:"31.00",currency:"USD",transactionId:"QA1176-PROVIDER-A"},a),"PAYMENT_AMOUNT_MISMATCH");
  assert.equal(validateMaishaPayPaymentEvidence({amount:"30.00",currency:"CDF",transactionId:"QA1176-PROVIDER-A"},a),"PAYMENT_CURRENCY_MISMATCH");
  assert.equal(validateMaishaPayPaymentEvidence({amount:"30.00",currency:"USD",transactionId:"UNRELATED"},a),"PAYMENT_PROVIDER_REFERENCE_MISMATCH");
  const signedBody = JSON.stringify({
    event:"payment.success",transactionReference:"QA1176-REF-A-"+suffix,
    transactionId:"QA1176-PROVIDER-A",amount:30,currency:"USD",status:"COMPLETED",
  });
  const signingSecret = "fake-hmac-secret-only-used-for-isolated-qa";
  const signingBytes = Buffer.from(signedBody,"utf8");
  const signature = "sha256="+createHmac("sha256",signingSecret).update(signingBytes).digest("hex");
  assert.equal(isAuthorizedMaishaPayCallback(signingSecret,signingBytes,signature),true);
  assert.equal(isAuthorizedMaishaPayCallback(undefined,signingBytes,signature),false);
  assert.equal(isAuthorizedMaishaPayCallback(signingSecret,Buffer.from(signedBody+" "),signature),false);
  const signedEvent = await db.webhookEvent.create({
    data:{
      provider:"maishapay",eventType:"payment-callback",status:"RECEIVED",
      idempotencyKey:"qa1176-signed-"+suffix,
      payload:{bodyBase64:signingBytes.toString("base64"),signature},
    },
  });
  const stored = await db.webhookEvent.findUniqueOrThrow({where:{id:signedEvent.id}});
  assert.equal(readVerifiedMaishaPayEvent(stored.payload,signingSecret)?.transactionReference,"QA1176-REF-A-"+suffix);
  assert.equal(readVerifiedMaishaPayEvent(stored.payload,"different-secret"),null);
  const unsignedLegacyEvent = await db.webhookEvent.create({
    data:{
      provider:"maishapay",eventType:"payment-callback",status:"UNMATCHED",
      idempotencyKey:"qa1176-legacy-"+suffix,
      payload:{transactionReference:"QA1176-REF-A-"+suffix,status:"paid"},
    },
  });
  assert.equal(readVerifiedMaishaPayEvent(unsignedLegacyEvent.payload,signingSecret),null,
    "Old unsigned events must not be trusted on manual replay");
  assert.equal((await db.payment.findMany({where:{organizationId:orgA},select:{id:true}})).length,1);
  assert.equal((await db.payment.findMany({where:{organizationId:orgB},select:{id:true}})).length,1);
  const after=await db.payment.findUniqueOrThrow({where:{id:payA}});
  assert.equal(after.status,"PENDING","No callback verification may advance payment automatically");
  assert.equal(after.paidAt,null);
  assert.equal(await db.invoice.count({where:{paymentId:payA}}),0,"No invoice on rejected evidence");
  console.log("PASS PAY-4B isolated PostgreSQL: stored decimals, tenant scoping, no automatic PAID/invoice.");
} finally {
  await db.webhookEvent.deleteMany({where:{idempotencyKey:{in:["qa1176-signed-"+suffix,"qa1176-legacy-"+suffix]}}});
  await db.payment.deleteMany({where:{id:{in:[payA,payB]}}});
  await db.organization.deleteMany({where:{id:{in:[orgA,orgB]}}});
  await db.user.deleteMany({where:{id:userId}});
  await db.$disconnect();
}
