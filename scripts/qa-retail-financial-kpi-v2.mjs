import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Static contract test for the first tranche of Retail KPI traceability v2.
 * Later lots must add database-level reconciliation and authenticated E2E.
 */
const metricsFile = readFileSync("lib/enterprise/retail/executive-metrics.ts", "utf8");
const definitions = readFileSync("lib/enterprise/retail/financial-metric-definitions.ts", "utf8");
const dashboard = readFileSync("components/enterprise/professional/retail-site-overview.tsx", "utf8");

const list = metricsFile.match(/RETAIL_EXECUTIVE_METRICS\s*=\s*\[([^\]]+)\]\s*as const/s);
assert.ok(list, "The canonical Retail executive metrics list must exist");
const keys = [...list[1].matchAll(/"([a-zA-Z]+)"/g)].map((match) => match[1]);
assert.equal(keys.length, 22, "Existing canonical metrics must remain represented");
assert.equal(new Set(keys).size, keys.length, "Metric identifiers must remain unique");

for (const key of keys) {
  const block = definitions.match(new RegExp(`\\b${key}: \\{([\\s\\S]*?)\\n  \\},`));
  assert.ok(block, `Interpretation missing for ${key}`);
  assert.match(block[1], /timeBasis: "(PERIOD_FLOW|CURRENT_BALANCE|ISSUANCE_PERIOD_CURRENT_ALLOCATION)"/);
  assert.match(block[1], /evidence: "[A-Z_]+"/);
  assert.match(block[1], /interpretation: \{ fr: ".+", en: ".+" \}/);
}
for (const current of ["outstanding", "overdue", "treasuryBalance", "treasuryReconciled", "treasuryAvailable"]) {
  assert.match(definitions, new RegExp(`\\b${current}: \\{\\s*timeBasis: "CURRENT_BALANCE"`));
}
assert.match(definitions, /invoiceAllocated:\s*\{\s*timeBasis: "ISSUANCE_PERIOD_CURRENT_ALLOCATION"/);
for (const period of ["financeCollections", "invoices", "postedRevenue", "postedCogs", "mobileMoneyCommission", "telcoMargin"]) {
  assert.match(definitions, new RegExp(`\\b${period}: \\{\\s*timeBasis: "PERIOD_FLOW"`));
}
assert.match(dashboard, /import \{ retailMetricTimeCaption \} from "@\/lib\/enterprise\/retail\/financial-metric-definitions"/);
assert.match(dashboard, /retailMetricTimeCaption\(metric, locale\)/);
assert.match(definitions, /Missing availability must not be inferred from operational balance/);
console.log(`Retail KPI definitions v2: ${keys.length} metrics, temporal badges and source interpretations validated.`);
