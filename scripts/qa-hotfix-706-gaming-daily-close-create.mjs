import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

const dailyClose = read("lib/enterprise/gaming/daily-close.ts");
const checkoutHttp = read("lib/enterprise/gaming/checkout-http.ts");
const e2e = read("tests/e2e/issue-693-gaming-checkout-invoice.spec.mjs");
const packageJson = read("package.json");

check(
  dailyClose.includes("Prisma.EnterpriseGamingDailyCloseLineCreateWithoutDailyCloseInput[]"),
  "Hotfix #706: daily-close lines must be typed with Prisma's nested create input.",
);

const linesStart = dailyClose.indexOf("const lines: Prisma.EnterpriseGamingDailyCloseLineCreateWithoutDailyCloseInput[]");
const createStart = dailyClose.indexOf("enterpriseGamingDailyClose.create({", linesStart);
const linesBlock = linesStart >= 0 && createStart > linesStart ? dailyClose.slice(linesStart, createStart) : "";

check(linesBlock.length > 0, "Hotfix #706: unable to isolate the daily-close line builder.");
check(
  !/\borganizationId\s*,/.test(linesBlock),
  "Hotfix #706: nested EnterpriseGamingDailyCloseLine creation must not pass organizationId manually.",
);
check(
  !/\bdailyCloseId\s*:/.test(linesBlock),
  "Hotfix #706: nested EnterpriseGamingDailyCloseLine creation must let Prisma propagate dailyCloseId.",
);
check(
  checkoutHttp.includes("GAMING_DAILY_CLOSE_CREATE_FAILED"),
  "Hotfix #706: Gaming daily-close creation needs a dedicated safe fallback message.",
);
check(
  checkoutHttp.includes("Aucune nouvelle clôture n’a été créée"),
  "Hotfix #706: the French daily-close fallback must explain that the failed attempt did not create a close.",
);
check(
  checkoutHttp.includes("No new close was created"),
  "Hotfix #706: the English daily-close fallback must explain that the failed attempt did not create a close.",
);
check(
  e2e.includes("#706 submits Gaming daily close"),
  "Hotfix #706: authenticated E2E must exercise real Gaming daily-close creation.",
);
check(
  e2e.includes("persisted.lines[0].organizationId"),
  "Hotfix #706: E2E must verify tenant propagation on the persisted nested line.",
);
check(
  packageJson.includes('"qa:hotfix-706"'),
  "Hotfix #706: package.json must expose the targeted QA command.",
);
check(
  packageJson.includes("qa-hotfix-706-gaming-daily-close-create.mjs"),
  "Hotfix #706: targeted QA must stay wired into package scripts.",
);

if (failures.length) {
  console.error(failures.map((failure) => `❌ ${failure}`).join("\n"));
  process.exit(1);
}

console.log("✅ Hotfix #706 vérifié : nested create Prisma, message sûr et couverture E2E de clôture Gaming.");
