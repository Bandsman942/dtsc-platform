import fs from "node:fs";

const file = "scripts/qa-retail-product-coherence.mjs";
let source = fs.readFileSync(file, "utf8");

const dailyRead = 'const dailyClose = read("components/enterprise/professional/retail-daily-close-workspace.tsx");';
const dailyWithCatalogs = `${dailyRead}\nconst retailWorkspaceFr = read("locales/retail-workspace.fr.json");\nconst retailWorkspaceEn = read("locales/retail-workspace.en.json");`;
if (!source.includes("const retailWorkspaceFr =")) {
  if (!source.includes(dailyRead)) throw new Error("Daily-close read marker not found.");
  source = source.replace(dailyRead, dailyWithCatalogs);
}

source = source.replace('  "Soumettre la clôture journalière",\n  "Historique des clôtures",\n', '');

const anchor = ']) check(dailyClose.includes(marker), `Retail daily close workspace must include ${marker}.`);';
const assertions = `${anchor}\nfor (const [key, frLabel, enLabel] of [\n  ["dailyCloseSubmitTheDailyClose", "Soumettre la clôture journalière", "Submit the daily close"],\n  ["dailyCloseDailyCloseHistory", "Historique des clôtures", "Daily close history"],\n]) {\n  check(dailyClose.includes(\`translateRetailWorkspace(locale, "\${key}")\`), \`Retail daily close must render canonical i18n key \${key}.\`);\n  check(retailWorkspaceFr.includes(\`"\${key}": "\${frLabel}"\`), \`Retail FR catalog must preserve business label for \${key}.\`);\n  check(retailWorkspaceEn.includes(\`"\${key}": "\${enLabel}"\`), \`Retail EN catalog must preserve business label for \${key}.\`);\n}`;
if (!source.includes("Retail daily close must render canonical i18n key")) {
  if (!source.includes(anchor)) throw new Error("Daily-close assertion anchor not found.");
  source = source.replace(anchor, assertions);
}

fs.writeFileSync(file, source);
console.log("Retail product coherence QA now verifies daily-close business labels through canonical FR/EN catalogs.");
