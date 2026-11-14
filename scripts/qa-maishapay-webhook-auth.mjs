import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

let eventUpserts = 0;
let processCalls = 0;
const env = { MAISHAPAY_CALLBACK_SECRET: undefined };
const audits = [];
const overrides = {
  "next/server": { NextResponse: { json: (body, options={}) => ({ status: options.status ?? 200, body }) } },
  "@/lib/env": { env },
  "@/lib/audit": {
    writeApiLog: async (data) => { audits.push({ status: data.statusCode }); },
    writeAuditLog: async () => {},
  },
  "@/lib/console/console-webhooks": {
    processStoredWebhookEvent: async () => { processCalls++; throw new Error("UNEXPECTED_CALLBACK_APPLICATION"); },
  },
  "@/lib/prisma": {
    prisma: { webhookEvent: {
      upsert: async () => {
        eventUpserts++;
        return { id: "QA_SYNTHETIC_EVENT", appliedAt: new Date(), status: "PROCESSED" };
      },
    } },
  },
  "@/lib/validators": {
    maishaPayCallbackSchema: { safeParse: (value) => ({
      success: true,
      data: {
        transactionReference: "QA_SYNTHETIC_REF",
        status: value?.status || "paid",
      },
    }) },
  },
};
const load = workflowTestLoader(overrides);
const { authorizeMaishaPayCallback } = load("@/lib/maishapay-callback-auth");
const { POST } = load("@/app/api/billing/maishapay/callback/route");

assert.deepEqual(authorizeMaishaPayCallback({
  expectedSecret: undefined, suppliedSecret: undefined, production: true,
}), { ok: false, reason: "CONFIGURATION_MISSING" });
assert.deepEqual(authorizeMaishaPayCallback({
  expectedSecret: "    ", suppliedSecret: "anything", production: true,
}), { ok: false, reason: "CONFIGURATION_MISSING" });
assert.deepEqual(authorizeMaishaPayCallback({
  expectedSecret: undefined, suppliedSecret: undefined, production: false,
}), { ok: true }, "Development-only compatibility remains isolated");
const secret = "QA_TEST_FAKE_SECRET_LONG_ENOUGH_00001";
assert.deepEqual(authorizeMaishaPayCallback({
  expectedSecret: secret, suppliedSecret: secret, production: true,
}), { ok: true });
assert.deepEqual(authorizeMaishaPayCallback({
  expectedSecret: secret, suppliedSecret: "QA_FAKE_OTHER", production: true,
}), { ok: false, reason: "UNAUTHORIZED" });
assert.deepEqual(authorizeMaishaPayCallback({
  expectedSecret: secret, suppliedSecret: undefined, production: true,
}), { ok: false, reason: "UNAUTHORIZED" });

const priorEnv=process.env.NODE_ENV;
process.env.NODE_ENV = "production";
function syntheticRequest({ querySecret, headerSecret, signature, status="paid" }={}) {
  const url = "https://api.invalid/api/billing/maishapay/callback" +
    (querySecret ? "?secret=" + encodeURIComponent(querySecret) : "");
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(headerSecret ? { "x-dtsc-webhook-secret": headerSecret } : {}),
      ...(signature ? { "x-maishapay-signature": signature } : {}),
    },
    body: JSON.stringify({ status, transactionReference: "QA_SYNTHETIC_REF" }),
  });
}
try {
  const missing = await POST(syntheticRequest());
  assert.equal(missing.status,503,"Production secret missing must fail closed");
  assert.equal(eventUpserts,0,"No DB events on missing config");
  env.MAISHAPAY_CALLBACK_SECRET=secret;

  const forged = await POST(syntheticRequest({headerSecret:"FAKE_WRONG"}));
  assert.equal(forged.status,401);
  assert.equal(eventUpserts,0,"Forged callback cannot mutate webhook queue");
  const badQuery = await POST(syntheticRequest({querySecret:"FAKE_WRONG"}));
  assert.equal(badQuery.status,401);
  assert.equal(eventUpserts,0);

  const validHeader = await POST(syntheticRequest({headerSecret:secret}));
  assert.equal(validHeader.status,200);
  assert.equal(eventUpserts,1,"Only authenticated callback can reach event upsert");

  const validLegacy = await POST(syntheticRequest({querySecret:secret}));
  assert.equal(validLegacy.status,200,"Existing query transport remains compatible");
  assert.equal(eventUpserts,2);

  const invalidHeaderWins = await POST(syntheticRequest({
    headerSecret:"FAKE_WRONG",querySecret:secret,
  }));
  assert.equal(invalidHeaderWins.status,401,"Explicit header must take precedence");
  assert.equal(eventUpserts,2);

  // Real provider signature uses HMAC of exact raw request body.
  const raw=JSON.stringify({status:"paid",transactionReference:"QA_SYNTHETIC_REF"});
  const signature="sha256="+createHmac("sha256",secret).update(raw,"utf8").digest("hex");
  const signed=await POST(syntheticRequest({signature}));
  assert.equal(signed.status,200,"Correct MaishaPay HMAC must authorize the route");
  assert.equal(eventUpserts,3);

  const badHmac=await POST(syntheticRequest({
    signature:"sha256="+("0".repeat(64)), headerSecret:secret,
  }));
  assert.equal(badHmac.status,401,"Present invalid HMAC must not fall back to correct bearer token");
  assert.equal(eventUpserts,3);

  const tamperedBody=await POST(syntheticRequest({signature,status:"failed"}));
  assert.equal(tamperedBody.status,401,"HMAC must bind the exact payload");
  assert.equal(eventUpserts,3);
  assert.equal(processCalls,0,"Synthetic already-processed events never replay");

  const source=readFileSync("app/api/billing/maishapay/callback/route.ts","utf8");
  assert.ok(source.indexOf("authorizeMaishaPayCallback(") < source.indexOf("JSON.parse(rawBody)"));
  assert.ok(source.indexOf("authorizeMaishaPayCallback(") < source.indexOf("webhookEvent.upsert"));
  assert.doesNotMatch(source,/if \(env\.MAISHAPAY_CALLBACK_SECRET &&/);
  const authSrc=readFileSync("lib/maishapay-callback-auth.ts","utf8");
  assert.match(authSrc,/timingSafeEqual/);
  assert.match(authSrc,/createHmac/);
  assert.match(source,/x-maishapay-signature/);
  assert.deepEqual(audits.map(x=>x.status),[503,401,401,200,200,401,200,401,401]);
  console.log("PASS PAY-4B: unconfigured Production fails closed, invalid tokens rejected, no queued mutations, legacy transport explicit.");
} finally {
  if(priorEnv===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=priorEnv;
}
