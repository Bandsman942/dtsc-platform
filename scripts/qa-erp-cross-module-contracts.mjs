import fs from "node:fs";
import { fail, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

const registryPath = "lib/enterprise/accounting/posting-registry-final.ts";
const matrixPath = "lib/enterprise/accounting/erp-finance-contract-matrix.ts";
const semanticPath = "lib/enterprise/accounting/semantic-account-registry.ts";
requirePaths([registryPath, matrixPath, semanticPath]);

const registry = fs.readFileSync(registryPath, "utf8");
const matrix = fs.readFileSync(matrixPath, "utf8");
const semantics = fs.readFileSync(semanticPath, "utf8");
const registryEvents = [...registry.matchAll(/^\s{2}([A-Z0-9_]+):/gm)].map((match) => match[1]);
const matrixEvents = [...matrix.matchAll(/event:\s*"([A-Z0-9_]+)"/g)].map((match) => match[1]);
const missing = registryEvents.filter((event) => !matrixEvents.includes(event));
const stale = matrixEvents.filter((event) => !registryEvents.includes(event));
const duplicates = matrixEvents.filter((event, index) => matrixEvents.indexOf(event) !== index);
if (missing.length) fail(`Posting events missing from ERP Finance matrix: ${missing.join(", ")}`);
if (stale.length) fail(`Stale ERP Finance matrix events: ${stale.join(", ")}`);
if (duplicates.length) fail(`Duplicate ERP Finance matrix events: ${[...new Set(duplicates)].join(", ")}`);

const semanticKeys = [...matrix.matchAll(/requiredSemanticKeys:\s*\[([^\]]*)\]/g)]
  .flatMap((match) => [...match[1].matchAll(/"([A-Z0-9_]+)"/g)].map((item) => item[1]));
const unknownKeys = [...new Set(semanticKeys)].filter((key) => !semantics.includes(`key: "${key}"`));
if (unknownKeys.length) fail(`Unknown semantic keys in ERP Finance matrix: ${unknownKeys.join(", ")}`);

for (const domain of ["SALES", "PROCUREMENT", "PAYROLL", "INVENTORY", "ASSETS", "RETAIL", "HEALTH", "PHARMACY"]) {
  requireTokens(matrixPath, [`domain: "${domain}"`]);
}
requireTokens("lib/enterprise/accounting/posting-service.ts", [
  "getPostingBuilderV2",
  "getPostingPeriod",
  "resolveSemanticPostingAccount",
  "status: \"POSTED\"",
  "idempotencyKey",
]);

success(`ERP cross-module Finance matrix (${registryEvents.length} posting events)`);
