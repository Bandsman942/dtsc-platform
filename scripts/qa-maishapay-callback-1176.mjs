import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isAuthorizedMaishaPayCallback,
  isConfirmedMaishaPayStatus,
  validateMaishaPayPaymentEvidence,
} from "../lib/payments/maishapay-callback-validation.ts";

// Every P0 callback must fail closed without a configured verifier.
const secret="qa-fake-secret-with-more-than-24-characters";
assert.equal(isAuthorizedMaishaPayCallback(undefined,secret),false);
assert.equal(isAuthorizedMaishaPayCallback("",secret),false);
assert.equal(isAuthorizedMaishaPayCallback(secret,null),false);
assert.equal(isAuthorizedMaishaPayCallback(secret,"incorrect"),false);
assert.equal(isAuthorizedMaishaPayCallback(secret,secret),true);
assert.equal(isConfirmedMaishaPayStatus({status:"completed"}),true);
assert.equal(isConfirmedMaishaPayStatus({statusCode:200}),true);
assert.equal(isConfirmedMaishaPayStatus({status:"failed",statusCode:200}),false);
assert.equal(isConfirmedMaishaPayStatus({status:"pending",statusCode:200}),false);
assert.equal(isConfirmedMaishaPayStatus({status:"unknown",statusCode:200}),false);

const payment={provider:"MAISHAPAY",amount:"30.00",currency:"USD",providerReference:"fake-psp-123"};
const payload={amount:"30",currency:"usd",transactionId:"fake-psp-123",status:"paid"};
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
assert.match(route,/if \(!env\.MAISHAPAY_CALLBACK_SECRET\)/,"No verifier => fail closed");
assert.match(route,/isAuthorizedMaishaPayCallback\(env\.MAISHAPAY_CALLBACK_SECRET, secret\)/);
assert.doesNotMatch(route,/if \(env\.MAISHAPAY_CALLBACK_SECRET &&/,"Conditional secret must never allow anonymous callbacks");
assert.match(route,/isConfirmedMaishaPayStatus\(payload\.data\)/);
assert.match(replay,/validateMaishaPayPaymentEvidence\(payload\.data, payment\)/);
assert.match(replay,/isConfirmedMaishaPayStatus\(payload\.data\)/);
const checkAt=replay.indexOf("validateMaishaPayPaymentEvidence(payload.data, payment)");
const activationAt=replay.indexOf("activateSubscriptionFromPayment(reference, payload.data)");
assert.ok(checkAt>0&&activationAt>checkAt,"Validation must run before activation even on operator replay");
assert.match(replay,/status: "UNMATCHED", lastError: evidenceError/);
console.log("PASS PAY-4B #1176: verified callback secret, exact amount/currency/provider evidence and replay guard.");
