import fs from "node:fs";

const historicalSuites = [
  "qa-641-gaming-sessions-engine.mjs",
  "qa-642-gaming-bookings.mjs",
  "qa-643-gaming-pricing.mjs",
];

const startMarker = 'for (const code of ["GAMING_DASHBOARD", "GAMING_TOURNAMENTS", "GAMING_REPORTS"]) {';
const endMarker = '\n\nincludesAll(domain,';

for (const filename of historicalSuites) {
  const sourcePath = new URL(`./${filename}`, import.meta.url);
  let source = fs.readFileSync(sourcePath, "utf8");
  source = source.replace(
    /check\((\w+)\?\.implementationStatus === "BETA", ([^;]+)\);/,
    'check(["BETA", "ACTIVE"].includes($1?.implementationStatus), $2);',
  );
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  if (start < 0 || end < 0) {
    console.error(`FAIL QA #645 compatibility: legacy future-module assertion block not found in ${filename}.`);
    process.exit(1);
  }

  const historicalBlock = source.slice(start, end);
  const replacement = `if (registry.version < 7) {\n${historicalBlock.split("\n").map((line) => `  ${line}`).join("\n")}\n}`;
  const migratedSource = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
  const sourceUrl = `data:text/javascript;base64,${Buffer.from(migratedSource, "utf8").toString("base64")}`;
  await import(sourceUrl);
}
