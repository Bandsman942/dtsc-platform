import fs from "node:fs";

const sourcePath = new URL("./qa-644-gaming-checkout-daily-close.mjs", import.meta.url);
let source = fs.readFileSync(sourcePath, "utf8");
source = source.replace(
  'check(module?.implementationStatus === "BETA", `${code} must be BETA`);',
  'check(["BETA", "ACTIVE"].includes(module?.implementationStatus), `${code} must remain implemented (BETA or ACTIVE after #646)`);',
);
const startMarker = 'for (const code of ["GAMING_DASHBOARD", "GAMING_TOURNAMENTS", "GAMING_REPORTS"]) {';
const endMarker = '\n\nincludesAll(domain,';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);

if (start < 0 || end < 0) {
  console.error("FAIL QA #644 compatibility: legacy #644 future-module assertion block not found.");
  process.exit(1);
}

const historicalBlock = source.slice(start, end);
const replacement = `if (registry.version < 7) {\n${historicalBlock.split("\n").map((line) => `  ${line}`).join("\n")}\n}`;
const migratedSource = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
const sourceUrl = `data:text/javascript;base64,${Buffer.from(migratedSource, "utf8").toString("base64")}`;
await import(sourceUrl);
