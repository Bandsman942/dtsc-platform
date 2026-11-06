import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function loadTypeScript(path) {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: () => { throw new Error("Unexpected runtime import"); } }, { filename: path });
  return exports;
}

const { gamingCheckoutCopy } = loadTypeScript("components/enterprise/gaming/gaming-checkout-i18n.ts");
const { gamingCheckoutFailureFeedback } = loadTypeScript("lib/enterprise/gaming/checkout-client-feedback.ts");
for (const locale of ["fr", "en"]) {
  const copy = gamingCheckoutCopy(locale);
  const forbidden = gamingCheckoutFailureFeedback({ status: 403, code: "GAMING_CHECKOUT_WAREHOUSE_REQUIRED" }, copy);
  assert.equal(forbidden.message, copy.feedbackForbidden, "HTTP refusal must supersede a misleading business code");
  assert.equal(Object.keys(forbidden.fields).length, 0);
  const cases = [
    [400, "ENTERPRISE_INPUT_INVALID", "feedbackValidation"],
    [401, "Unauthorized", "feedbackUnauthenticated"],
    [403, "Forbidden", "feedbackForbidden"],
    [409, "GAMING_CHECKOUT_REVISION_CONFLICT", "feedbackConflict"],
    [422, "SOME_UNKNOWN_ERROR", "feedbackValidation"],
    [429, "Too many requests", "feedbackRateLimited"],
    [500, "GAMING_CHECKOUT_PAYMENT_EXCEEDS_OUTSTANDING", "feedbackUnavailable"],
  ];
  for (const [status, code, key] of cases) {
    const result = gamingCheckoutFailureFeedback({ status, code, details: { internal: "password=private" } }, copy);
    assert.equal(result.message, copy[key], `${locale} HTTP ${status} must use the canonical localized message`);
    assert.doesNotMatch(result.message, /password|SOME_UNKNOWN_ERROR|ENTERPRISE_INPUT_INVALID|GAMING_CHECKOUT_/);
  }
  assert.equal(gamingCheckoutFailureFeedback(null, copy).message, copy.feedbackUnavailable);
  const amount = gamingCheckoutFailureFeedback({ status: 409, code: "GAMING_CHECKOUT_PAYMENT_EXCEEDS_OUTSTANDING" }, copy);
  assert.equal(amount.message, copy.feedbackPaymentExceeds);
  assert.equal(amount.fields.amount, copy.feedbackPaymentExceeds);
  const cash = gamingCheckoutFailureFeedback({ status: 409, code: "GAMING_CHECKOUT_OPEN_CASH_SESSION_REQUIRED" }, copy);
  assert.equal(cash.fields.financialAccountId, copy.openCashSessionRequired);
  const fields = gamingCheckoutFailureFeedback({ status: 400, code: "ENTERPRISE_INPUT_INVALID", details: { issues: [
    { path: ["amount"], message: "secret 42" },
    { path: ["financialAccountId"], message: "secret account" },
    { path: ["internalSensitiveField"], message: "secret" },
  ] } }, copy);
  assert.equal(fields.fields.amount, copy.feedbackFieldInvalid);
  assert.equal(fields.fields.financialAccountId, copy.feedbackFieldInvalid);
  assert.equal(Object.keys(fields.fields).length, 2);
  assert.ok(fields.message.includes(copy.feedbackMultipleFields));
  assert.doesNotMatch(JSON.stringify(fields), /secret|internalSensitiveField/);
  assert.notStrictEqual(gamingCheckoutFailureFeedback({ status: 409, code: "X" }, copy), gamingCheckoutFailureFeedback({ status: 409, code: "X" }, copy));
}

const workspace = readFileSync("components/enterprise/gaming/enterprise-gaming-checkout-workspace.tsx", "utf8");
assert.match(workspace, /useToastMessage\(feedback\?\.notice\)/);
assert.match(workspace, /setFeedback\(\{ \.\.\.mapped, message, modal, notice: \{ tone: "error", description: message \} \}\)/,
  "Every failed attempt must produce a fresh typed error notice");
assert.match(workspace, /error instanceof ProfessionalApiError/);
assert.match(workspace, /professionalMutation\(/);
assert.match(workspace, /professionalRequest<T>\(/);
assert.match(workspace, /role="alert"/);
for (const name of ["sessionId", "warehouseId", "financialAccountId", "amount", "approverUserId", "reason"]) {
  assert.ok(workspace.includes(`error={formError("${name}")}`), `${name} needs adjacent field feedback`);
}
assert.doesNotMatch(workspace, /setMessage\(error instanceof Error \? error\.message|body\?\.error \|\| "LOAD_FAILED"/);
assert.match(workspace, /setModal\(null\); setExtras\(\[\]\); setSuccess\(copy\.actionDone\)/,
  "Create form closes only after an HTTP-successful mutation");
console.log("OK: Gaming checkout feedback uses HTTP status/code, FR/EN messages, safe field errors and repeatable error notices.");
