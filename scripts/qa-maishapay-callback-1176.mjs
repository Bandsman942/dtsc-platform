import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  isAuthorizedMaishaPayCallback,
  isConfirmedMaishaPayStatus,
  normalizeMaishaPayWebhook,
  readVerifiedMaishaPayEvent,
  validateMaishaPayPaymentEvidence,
} from "../lib/payments/maishapay-callback-validation.ts";

const secret = "qa-only-native-webhook-hmac-key-32chars";
const signedBody = '{ "event": "payment.success", "transactionReference": "FAKE-ORDER", "transactionId": "FAKE-PSP-123", "amount": 30, "currency": "USD", "status": "COMPLETED" }';
const signature = "sha256=" + createHmac("sha256", secret).update(Buffer.from(signedBody, "utf8")).digest("hex");
assert.equal(isAuthorizedMaishaPayCallback(secret, Buffer.from(signedBody), signature), true);
assert.equal(isAuthorizedMaishaPayCallback(undefined, Buffer.from(signedBody), signature), false);
assert.equal(isAuthorizedMaishaPayCallback("", Buffer.from(signedBody), signature), false);
assert.equal(isAuthorizedMaishaPayCallback(secret, Buffer.from(signedBody), null), false);
assert.equal(isAuthorizedMaishaPayCallback(secret, Buffer.from(signedBody), "bad-legacy-secret"), false);
assert.equal(isAuthorizedMaishaPayCallback(secret, Buffer.from(signedBody), "sha256=wrong"), false);
assert.equal(isAuthorizedMaishaPayCallback("wrong-secret", Buffer.from(signedBody), signature), false);
assert.equal(isAuthorizedMaishaPayCallback(secret, Buffer.from(signedBody + " "), signature), false,
  "Even insignificant whitespace changes the signed bytes");
assert.equal(isAuthorizedMaishaPayCallback(secret, Buffer.from(signedBody.replace("30", "31")), signature), false);
assert.equal(isAuthorizedMaishaPayCallback(secret, Buffer.from(signedBody), signature.replace(/.$/, "x")), false);

const signedRecord = {bodyBase64: Buffer.from(signedBody).toString("base64"), signature};
const callback = readVerifiedMaishaPayEvent(signedRecord, secret);
assert.deepEqual(callback, {
  transactionReference: "FAKE-ORDER",
  originatingTransactionId: undefined,
  transactionId: "FAKE-PSP-123",
  status: "COMPLETED",
  statusCode: undefined,
  amount: 30,
  currency: "USD",
});
assert.equal(readVerifiedMaishaPayEvent({...signedRecord,bodyBase64:Buffer.from(signedBody.replace("30","31")).toString("base64")},secret),null);
assert.equal(readVerifiedMaishaPayEvent({...signedRecord,signature:"sha256="+"0".repeat(64)},secret),null);
assert.equal(readVerifiedMaishaPayEvent({transactionReference:"FAKE-ORDER",status:"paid"},secret),null,
  "Legacy stored events without original signed evidence must never be executable");

const vendorV2 = {
  id: "evt_MP_FAKE",
  type: "transaction.success",
  data: {
    transaction_id:"txn_MP_FAKE", reference:"ORDER-FAKE",
    amount: 500000, currency:"CDF", payment_status:"SUCCESS",
  },
};
const normalized = normalizeMaishaPayWebhook(vendorV2);
assert.equal(normalized?.transactionReference,"ORDER-FAKE");
assert.equal(normalized?.transactionId,"txn_MP_FAKE");
assert.equal(normalized?.amount,500000);
assert.equal(normalized?.status,"SUCCESS");
assert.equal(isConfirmedMaishaPayStatus(normalized),true);
assert.equal(normalizeMaishaPayWebhook({...vendorV2,type:"b2c.transfer.success"}),null);
assert.equal(normalizeMaishaPayWebhook({...vendorV2,data:{...vendorV2.data,payment_status:"FAILED"}}),null);
assert.equal(isConfirmedMaishaPayStatus({status:"completed"}),true);
assert.equal(isConfirmedMaishaPayStatus({statusCode:200}),true);
assert.equal(isConfirmedMaishaPayStatus({status:"failed",statusCode:200}),false);
assert.equal(isConfirmedMaishaPayStatus({status:"pending",statusCode:200}),false);
assert.equal(isConfirmedMaishaPayStatus({status:"unknown",statusCode:200}),false);

const payment={provider:"MAISHAPAY",amount:"30.00",currency:"USD",providerReference:"FAKE-PSP-123"};
const payload=callback;
assert.equal(validateMaishaPayPaymentEvidence(payload,payment),null);
assert.equal(validateMaishaPayPaymentEvidence({...payload,amount:"30.01"},payment),"PAYMENT_AMOUNT_MISMATCH");
assert.equal(validateMaishaPayPaymentEvidence({...payload,amount:"30.001"},payment),"PAYMENT_AMOUNT_MISMATCH");
assert.equal(validateMaishaPayPaymentEvidence({...payload,amount:undefined},payment),"PAYMENT_AMOUNT_MISMATCH");
assert.equal(validateMaishaPayPaymentEvidence({...payload,amount:"3e1"},payment),"PAYMENT_AMOUNT_MISMATCH");
assert.equal(validateMaishaPayPaymentEvidence({...payload,currency:"CDF"},payment),"PAYMENT_CURRENCY_MISMATCH");
assert.equal(validateMaishaPayPaymentEvidence({...payload,currency:undefined},payment),"PAYMENT_CURRENCY_MISMATCH");
assert.equal(validateMaishaPayPaymentEvidence({...payload,transactionId:"different"},payment),"PAYMENT_PROVIDER_REFERENCE_MISMATCH");
assert.equal(validateMaishaPayPaymentEvidence(payload,{...payment,provider:"OTHER"}),"PAYMENT_PROVIDER_MISMATCH");
assert.equal(validateMaishaPayPaymentEvidence(payload,{...payment,amount:"-30"}),"PAYMENT_AMOUNT_MISMATCH");

const route=readFileSync("app/api/billing/maishapay/callback/route.ts","utf8");
const replay=readFileSync("lib/console/console-webhooks.ts","utf8");
assert.match(route,/if \(!env\.MAISHAPAY_CALLBACK_SECRET\)/,"Unconfigured native verifier must fail closed");
assert.match(route,/req\.headers\.get\("x-maishapay-signature"\)/);
assert.match(route,/Buffer\.from\(await req\.arrayBuffer\(\)\)/,"Verify original request bytes");
assert.match(route,/isAuthorizedMaishaPayCallback\(env\.MAISHAPAY_CALLBACK_SECRET, rawBody, signature\)/);
assert.doesNotMatch(route,/req\.headers\.get\("x-dtsc-webhook-secret"\)|searchParams\.get\("secret"\)/,"No live code may read legacy bearer credentials");
const verifyAt=route.indexOf("isAuthorizedMaishaPayCallback(env.MAISHAPAY_CALLBACK_SECRET, rawBody, signature)");
const storeAt=route.indexOf("prisma.webhookEvent.upsert");
assert.ok(verifyAt>0 && storeAt>verifyAt,"Native signature MUST be checked before persistence");
assert.match(route,/bodyBase64: rawBody\.toString\("base64"\)/,"Persist exact signed payload bytes");
assert.match(route,/isConfirmedMaishaPayStatus\(payload\.data\)/);
assert.doesNotMatch(route,/update: \{ payload:/,"Signed event must remain immutable on retry");
assert.match(replay,/readVerifiedMaishaPayEvent\(event\.payload, env\.MAISHAPAY_CALLBACK_SECRET\)/);
assert.match(replay,/validateMaishaPayPaymentEvidence\(payload\.data, payment\)/);
const recheckAt=replay.indexOf("readVerifiedMaishaPayEvent(event.payload, env.MAISHAPAY_CALLBACK_SECRET)");
const activationAt=replay.indexOf("activateSubscriptionFromPayment(reference, payload.data)");
assert.ok(recheckAt>0 && activationAt>recheckAt,"Reverify HMAC before admin replay");
assert.match(replay,/WEBHOOK_SIGNATURE_UNVERIFIED/);
assert.match(replay,/status: "UNMATCHED", lastError: evidenceError/);
console.log("PASS PAY-4B #1176: native HMAC on unchanged bytes, signed replay, vendor formats, amount/currency and anti-forgery.");
