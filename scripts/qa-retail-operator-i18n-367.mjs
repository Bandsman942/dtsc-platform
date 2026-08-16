import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// Canonical Retail close/operator i18n contract for #367.
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const parse = (file) => JSON.parse(read(file));
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const fr = parse("locales/retail-workspace.fr.json");
const en = parse("locales/retail-workspace.en.json");
const frKeys = Object.keys(fr).sort();
const enKeys = Object.keys(en).sort();
check(JSON.stringify(frKeys) === JSON.stringify(enKeys), "Retail FR/EN catalogs must keep strict key parity.");
check(frKeys.length >= 150, `Retail canonical catalog unexpectedly small after #367: ${frKeys.length}`);

const targets = [
  "components/enterprise/professional/retail-daily-close-workspace.tsx",
  "components/enterprise/professional/retail-operator-workspace.tsx",
  "components/enterprise/professional/mobile-money-agency-workspace.tsx",
  "components/enterprise/professional/mobile-money-cash-session-manager.tsx",
];

function conditionIsLocalLiteral(node, sf) {
  if (!ts.isConditionalExpression(node)) return false;
  const condition = node.condition.getText(sf).replace(/\s+/g, " ").trim();
  const localeCondition = /^(?:locale\s*={2,3}\s*["']en["']|["']en["']\s*={2,3}\s*locale)$/.test(condition);
  return localeCondition && ts.isStringLiteralLike(node.whenTrue) && ts.isStringLiteralLike(node.whenFalse);
}

for (const file of targets) {
  const source = read(file);
  check(source.includes("translateRetailWorkspace"), `${file}: canonical Retail translator missing.`);
  check(!source.includes("document.documentElement.lang"), `${file}: DOM language inference must not format Retail values.`);
  check(!source.includes('toLocaleString("fr-FR"') && !source.includes('toLocaleString("en-US"'), `${file}: direct locale formatting remains.`);
  check(!/set(?:Configuration|Preview)Error\([^\n]*instanceof Error[^\n]*\.message/.test(source), `${file}: raw backend error can still reach customer UI.`);
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (conditionIsLocalLiteral(node, sf)) failures.push(`${file}: local FR/EN literal ternary remains at line ${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}.`);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "moneyValue") check(node.arguments.length >= 3, `${file}: moneyValue call without explicit locale at line ${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}.`);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "formatEnterpriseDate") check(node.arguments.length >= 2, `${file}: formatEnterpriseDate call without explicit locale at line ${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}.`);
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

const daily = read(targets[0]);
for (const marker of ["customerFacingFinancialAccountType", "customerFacingStatusLabel", "/retail/daily-close", "idempotencyKey", 'dashboard.access.canManage && item.status === "SUBMITTED"', 'pageSize: "50"', '/enterprise-modules/FINANCE_CASH', '/enterprise-modules/FINANCE_TREASURY']) check(daily.includes(marker), `Daily close contract lost marker: ${marker}`);
check(!/function moneyValue\(/.test(daily), "Daily close must use the shared locale-aware Retail money formatter.");

const operator = read(targets[1]);
for (const marker of ["customerFacingMobileMoneyTransactionType", "customerFacingFeeCollectionMode", "customerFacingStatusLabel", "customerFacingFinancialAccountType", "operatorFloatAccountId: null", "floatAccountId: null", "TELCO_TOPUPS", "/retail/telco-topups", "/retail/mobile-money", "RetailErpLinks"]) check(operator.includes(marker), `Operator contract lost marker: ${marker}`);

const mobile = read(targets[2]);
for (const marker of ["MobileMoneyCashSessionManager", "customerFacingMobileMoneyTransactionType", "customerFacingFeeCollectionMode", "floatAccountId: null", "/retail/mobile-money", "/retail/mobile-money/fx", "RetailErpLinks"]) check(mobile.includes(marker), `Mobile Money contract lost marker: ${marker}`);
check(mobile.includes("customerFacingError"), "Mobile Money configuration errors must be customer-facing sanitized.");

const cash = read(targets[3]);
for (const marker of ["/retail/cash-sessions", "PENDING_VALIDATION", "moduleCode", "TELCO_TOPUPS", "MOBILE_MONEY_AGENCY", "RetailMutation"]) check(cash.includes(marker), `Cash-session contract lost marker: ${marker}`);

for (const file of [targets[1], targets[2], targets[3]]) {
  const source = read(file);
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visitCopy(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "COPY" && node.initializer) {
      const text = node.initializer.getText(sf);
      check(!/(?:operationTitle|title|description|active|openSessions)\s*:\s*["']/.test(text), `${file}: local COPY still owns customer-visible literal strings.`);
    }
    ts.forEachChild(node, visitCopy);
  }
  visitCopy(sf);
}

const shared = read("components/enterprise/professional/retail-workspace-shared.tsx");
check(shared.includes('locale: "fr" | "en"'), "Shared Retail money formatter must require an explicit locale.");
check(!shared.includes("document.documentElement.lang"), "Shared Retail money formatter still contains the historical DOM-language fallback.");

const legacySchema = ["prisma/schema.prisma", "prisma/enterprise-retail.prisma"].filter((file) => fs.existsSync(path.join(root, file))).map(read).join("\n");
check(!legacySchema.includes("#367"), "#367 must not introduce an i18n schema workaround.");

if (failures.length) {
  console.error("Retail operator i18n #367 QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Retail operator i18n #367 QA passed: ${frKeys.length} canonical FR/EN keys, explicit locale formatting and operator business contracts preserved.`);
