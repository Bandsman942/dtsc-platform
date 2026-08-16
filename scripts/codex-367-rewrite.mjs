import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, value) => fs.writeFileSync(path.join(root, file), value);
const parseJson = (file) => JSON.parse(read(file));

const frPath = "locales/retail-workspace.fr.json";
const enPath = "locales/retail-workspace.en.json";
const fr = parseJson(frPath);
const en = parseJson(enPath);
const pairToKey = new Map();
for (const key of Object.keys(fr)) {
  if (typeof fr[key] === "string" && typeof en[key] === "string") pairToKey.set(`${en[key]}\u0000${fr[key]}`, key);
}

function pascal(value) {
  const words = String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12);
  const out = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
  return out || "Text";
}

function canonicalKey(prefix, hint, enValue, frValue) {
  const pair = `${enValue}\u0000${frValue}`;
  const existing = pairToKey.get(pair);
  if (existing) return existing;
  let base = `${prefix}${pascal(hint || enValue)}`.slice(0, 92);
  base = base.charAt(0).toLowerCase() + base.slice(1);
  let key = base;
  let index = 2;
  while (Object.prototype.hasOwnProperty.call(fr, key) && (fr[key] !== frValue || en[key] !== enValue)) key = `${base}${index++}`;
  fr[key] = frValue;
  en[key] = enValue;
  pairToKey.set(pair, key);
  return key;
}

function unwrap(node) {
  let current = node;
  while (current && (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current))) current = current.expression;
  return current;
}

function literal(node) {
  const value = unwrap(node);
  return value && ts.isStringLiteralLike(value) ? value.text : null;
}

function propertyName(node) {
  if (!node) return "";
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return node.getText();
}

function isEnglishLocaleCondition(node, sf) {
  const text = node.getText(sf).replace(/\s+/g, " ").trim();
  return /^(?:locale\s*={2,3}\s*["']en["']|["']en["']\s*={2,3}\s*locale)$/.test(text);
}

function apply(source, replacements) {
  const ordered = replacements
    .filter((item, index, all) => all.findIndex((other) => other.start === item.start && other.end === item.end && other.text === item.text) === index)
    .sort((a, b) => b.start - a.start || b.end - a.end);
  let output = source;
  let lastStart = Infinity;
  for (const item of ordered) {
    if (item.end > lastStart && item.end !== item.start) throw new Error(`Overlapping rewrite at ${item.start}:${item.end}`);
    output = output.slice(0, item.start) + item.text + output.slice(item.end);
    lastStart = item.start;
  }
  return output;
}

function importInsertion(sf, statement) {
  const imports = sf.statements.filter(ts.isImportDeclaration);
  if (!imports.length) return { start: 0, end: 0, text: `${statement}\n` };
  const end = imports.at(-1).end;
  return { start: end, end, text: `\n${statement}` };
}

function functionHasLocale(fn) {
  if (fn.parameters?.some((param) => ts.isIdentifier(param.name) && param.name.text === "locale")) return true;
  const body = fn.body;
  if (!body || !ts.isBlock(body)) return false;
  for (const statement of body.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === "locale") return true;
    }
  }
  return false;
}

function localeInScope(node) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionLike(current) && functionHasLocale(current)) return true;
    current = current.parent;
  }
  return false;
}

function transformCopy(sf, source, prefix, replacements) {
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "COPY" && node.initializer) {
      const rootObject = unwrap(node.initializer);
      if (!rootObject || !ts.isObjectLiteralExpression(rootObject)) return;
      const localeObjects = {};
      for (const prop of rootObject.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const name = propertyName(prop.name);
        const object = unwrap(prop.initializer);
        if ((name === "fr" || name === "en") && object && ts.isObjectLiteralExpression(object)) localeObjects[name] = object;
      }
      if (!localeObjects.fr || !localeObjects.en) return;
      const frProps = new Map(localeObjects.fr.properties.filter(ts.isPropertyAssignment).map((prop) => [propertyName(prop.name), prop]));
      const enProps = new Map(localeObjects.en.properties.filter(ts.isPropertyAssignment).map((prop) => [propertyName(prop.name), prop]));
      for (const [name, frProp] of frProps) {
        const enProp = enProps.get(name);
        if (!enProp) continue;
        const frValue = literal(frProp.initializer);
        const enValue = literal(enProp.initializer);
        if (frValue === null || enValue === null) continue;
        const key = canonicalKey(prefix, name, enValue, frValue);
        replacements.push({ start: frProp.initializer.getStart(sf), end: frProp.initializer.end, text: `translateRetailWorkspace("fr", ${JSON.stringify(key)})` });
        replacements.push({ start: enProp.initializer.getStart(sf), end: enProp.initializer.end, text: `translateRetailWorkspace("en", ${JSON.stringify(key)})` });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

function transformCustomerErrorFallbacks(sf, prefix, replacements) {
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(sf).endsWith("customerFacingError")) {
      for (const arg of node.arguments) {
        const object = unwrap(arg);
        if (!object || !ts.isObjectLiteralExpression(object)) continue;
        const props = new Map(object.properties.filter(ts.isPropertyAssignment).map((prop) => [propertyName(prop.name), prop]));
        const frProp = props.get("fr");
        const enProp = props.get("en");
        if (!frProp || !enProp) continue;
        const frValue = literal(frProp.initializer);
        const enValue = literal(enProp.initializer);
        if (frValue === null || enValue === null) continue;
        const key = canonicalKey(prefix, "Error", enValue, frValue);
        replacements.push({ start: frProp.initializer.getStart(sf), end: frProp.initializer.end, text: `translateRetailWorkspace("fr", ${JSON.stringify(key)})` });
        replacements.push({ start: enProp.initializer.getStart(sf), end: enProp.initializer.end, text: `translateRetailWorkspace("en", ${JSON.stringify(key)})` });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

function transformLiteralTernaries(sf, prefix, replacements) {
  function visit(node) {
    if (ts.isConditionalExpression(node) && isEnglishLocaleCondition(node.condition, sf)) {
      const enValue = literal(node.whenTrue);
      const frValue = literal(node.whenFalse);
      if (enValue !== null && frValue !== null) {
        const key = canonicalKey(prefix, enValue, enValue, frValue);
        replacements.push({ start: node.getStart(sf), end: node.end, text: `translateRetailWorkspace(locale, ${JSON.stringify(key)})` });
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

function transformLocaleCalls(sf, replacements, { money = false, dates = false, unresolved, file }) {
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (money && node.expression.text === "moneyValue" && node.arguments.length < 3) {
        if (!localeInScope(node)) unresolved.push(`${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1} moneyValue`);
        else replacements.push({ start: node.end - 1, end: node.end - 1, text: `${node.arguments.length ? ", " : ""}locale` });
      }
      if (dates && node.expression.text === "formatEnterpriseDate" && node.arguments.length < 2) {
        if (!localeInScope(node)) unresolved.push(`${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1} formatEnterpriseDate`);
        else replacements.push({ start: node.end - 1, end: node.end - 1, text: `${node.arguments.length ? ", " : ""}locale` });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

function transformFile(file, prefix, options = {}) {
  let source = read(file);
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const replacements = [];
  const unresolved = [];

  transformCopy(sf, source, prefix, replacements);
  transformCustomerErrorFallbacks(sf, prefix, replacements);
  transformLiteralTernaries(sf, prefix, replacements);
  transformLocaleCalls(sf, replacements, { money: options.money, dates: options.dates, unresolved, file });

  if (options.removeLocalMoney) {
    for (const statement of sf.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === "moneyValue") {
        replacements.push({ start: statement.getFullStart(), end: statement.end, text: "" });
      }
    }
  }

  if (!source.includes('from "@/lib/i18n"') && !source.includes("from '@/lib/i18n'")) {
    replacements.push(importInsertion(sf, 'import { translateRetailWorkspace } from "@/lib/i18n";'));
  } else if (!source.includes("translateRetailWorkspace")) {
    throw new Error(`${file}: existing i18n import needs manual merge`);
  }

  if (options.addSharedMoney && !source.includes('moneyValue } from "@/components/enterprise/professional/retail-workspace-shared"')) {
    replacements.push(importInsertion(sf, 'import { moneyValue } from "@/components/enterprise/professional/retail-workspace-shared";'));
  }

  if (unresolved.length) throw new Error(`Locale not in scope:\n${unresolved.join("\n")}`);
  source = apply(source, replacements);

  if (file.endsWith("mobile-money-agency-workspace.tsx")) {
    source = source.replace('import { customerFacingStatusLabel } from "@/lib/customer-facing-language";', 'import { customerFacingError, customerFacingStatusLabel } from "@/lib/customer-facing-language";');
    source = source.replace(
      'setConfigurationError(error instanceof Error ? error.message : "MOBILE_MONEY_CONFIGURATION_LOAD_FAILED");',
      'setConfigurationError(customerFacingError(error, locale, {\n        fr: translateRetailWorkspace("fr", "retailActionError"),\n        en: translateRetailWorkspace("en", "retailActionError"),\n      }));',
    );
    source = source.replace('  }, [organizationId]);', '  }, [locale, organizationId]);');
    source = source.replace('setPreviewError(error instanceof Error ? error.message : copy.fxMissingRate);', 'setPreviewError(copy.fxMissingRate);');
  }

  write(file, source);
}

const targets = [
  ["components/enterprise/professional/retail-daily-close-workspace.tsx", "dailyClose", { money: true, dates: true, removeLocalMoney: true, addSharedMoney: true }],
  ["components/enterprise/professional/retail-operator-workspace.tsx", "operator", { money: true, dates: true }],
  ["components/enterprise/professional/mobile-money-agency-workspace.tsx", "mobileMoney", { money: true, dates: true }],
  ["components/enterprise/professional/mobile-money-cash-session-manager.tsx", "cashSession", { money: true, dates: true }],
];
for (const [file, prefix, options] of targets) transformFile(file, prefix, options);

// Make every Retail money formatter call explicit before removing the historical DOM-language fallback.
const professionalDir = path.join(root, "components/enterprise/professional");
const retailFiles = fs.readdirSync(professionalDir)
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => `components/enterprise/professional/${name}`)
  .filter((file) => !targets.some(([target]) => target === file))
  .filter((file) => {
    const source = read(file);
    return source.includes("retail-workspace-shared") && source.includes("moneyValue");
  });

for (const file of retailFiles) {
  const source = read(file);
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const replacements = [];
  const unresolved = [];
  transformLocaleCalls(sf, replacements, { money: true, dates: false, unresolved, file });
  if (unresolved.length) throw new Error(`Retail money locale unresolved:\n${unresolved.join("\n")}`);
  if (replacements.length) write(file, apply(source, replacements));
}

const sharedPath = "components/enterprise/professional/retail-workspace-shared.tsx";
let shared = read(sharedPath);
const sharedSf = ts.createSourceFile(sharedPath, shared, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const sharedReplacements = [];
const sharedUnresolved = [];
transformLocaleCalls(sharedSf, sharedReplacements, { money: true, dates: false, unresolved: sharedUnresolved, file: sharedPath });
if (sharedUnresolved.length) throw new Error(`Shared Retail money locale unresolved:\n${sharedUnresolved.join("\n")}`);
for (const statement of sharedSf.statements) {
  if (ts.isFunctionDeclaration(statement) && statement.name?.text === "moneyValue") {
    sharedReplacements.push({
      start: statement.getStart(sharedSf),
      end: statement.end,
      text: `export function moneyValue(value: string | number | null | undefined, currency: string | undefined, locale: "fr" | "en") {\n  const amount = Number(value || 0);\n  const localeCode = ({ fr: "fr-FR", en: "en-US" } as const)[locale];\n  const formatted = Number.isFinite(amount) ? amount.toLocaleString(localeCode, { maximumFractionDigits: 2 }) : "0";\n  return currency ? \`\${formatted} \${currency}\` : formatted;\n}`,
    });
  }
}
shared = apply(shared, sharedReplacements);
write(sharedPath, shared);

write(frPath, `${JSON.stringify(fr, null, 2)}\n`);
write(enPath, `${JSON.stringify(en, null, 2)}\n`);

const runnerPath = "scripts/run-regression-qa-ci.mjs";
let runner = read(runnerPath);
if (!runner.includes("qa-retail-operator-i18n-367.mjs")) {
  runner = runner.replace('commands.unshift("node scripts/qa-retail-core-i18n-366.mjs");', 'commands.unshift("node scripts/qa-retail-operator-i18n-367.mjs");\ncommands.unshift("node scripts/qa-retail-core-i18n-366.mjs");');
  write(runnerPath, runner);
}

const qa = `import fs from "node:fs";\nimport path from "node:path";\nimport ts from "typescript";\n\nconst root = process.cwd();\nconst read = (file) => fs.readFileSync(path.join(root, file), "utf8");\nconst parse = (file) => JSON.parse(read(file));\nconst failures = [];\nconst check = (ok, message) => { if (!ok) failures.push(message); };\nconst fr = parse("locales/retail-workspace.fr.json");\nconst en = parse("locales/retail-workspace.en.json");\nconst frKeys = Object.keys(fr).sort();\nconst enKeys = Object.keys(en).sort();\ncheck(JSON.stringify(frKeys) === JSON.stringify(enKeys), "Retail FR/EN catalogs must keep strict key parity.");\ncheck(frKeys.length >= 150, \`Retail canonical catalog unexpectedly small after #367: \${frKeys.length}\`);\n\nconst targets = [\n  "components/enterprise/professional/retail-daily-close-workspace.tsx",\n  "components/enterprise/professional/retail-operator-workspace.tsx",\n  "components/enterprise/professional/mobile-money-agency-workspace.tsx",\n  "components/enterprise/professional/mobile-money-cash-session-manager.tsx",\n];\n\nfunction conditionIsLocalLiteral(node, sf) {\n  if (!ts.isConditionalExpression(node)) return false;\n  const condition = node.condition.getText(sf).replace(/\\s+/g, " ").trim();\n  const localeCondition = /^(?:locale\\s*={2,3}\\s*["']en["']|["']en["']\\s*={2,3}\\s*locale)$/.test(condition);\n  return localeCondition && ts.isStringLiteralLike(node.whenTrue) && ts.isStringLiteralLike(node.whenFalse);\n}\n\nfor (const file of targets) {\n  const source = read(file);\n  check(source.includes("translateRetailWorkspace"), \`\${file}: canonical Retail translator missing.\`);\n  check(!source.includes("document.documentElement.lang"), \`\${file}: DOM language inference must not format Retail values.\`);\n  check(!source.includes('toLocaleString("fr-FR"') && !source.includes('toLocaleString("en-US"'), \`\${file}: direct locale formatting remains.\`);\n  check(!/set(?:Configuration|Preview)Error\\([^\\n]*instanceof Error[^\\n]*\\.message/.test(source), \`\${file}: raw backend error can still reach customer UI.\`);\n  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);\n  function visit(node) {\n    if (conditionIsLocalLiteral(node, sf)) failures.push(\`\${file}: local FR/EN literal ternary remains at line \${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}.\`);\n    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "moneyValue") check(node.arguments.length >= 3, \`\${file}: moneyValue call without explicit locale at line \${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}.\`);\n    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "formatEnterpriseDate") check(node.arguments.length >= 2, \`\${file}: formatEnterpriseDate call without explicit locale at line \${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}.\`);\n    ts.forEachChild(node, visit);\n  }\n  visit(sf);\n}\n\nconst daily = read(targets[0]);\nfor (const marker of ["customerFacingFinancialAccountType", "customerFacingStatusLabel", "/retail/daily-close", "idempotencyKey", 'dashboard.access.canManage && item.status === "SUBMITTED"', 'pageSize: "50"', '/enterprise-modules/FINANCE_CASH', '/enterprise-modules/FINANCE_TREASURY']) check(daily.includes(marker), \`Daily close contract lost marker: \${marker}\`);\ncheck(!/function moneyValue\\(/.test(daily), "Daily close must use the shared locale-aware Retail money formatter.");\n\nconst operator = read(targets[1]);\nfor (const marker of ["customerFacingMobileMoneyTransactionType", "customerFacingFeeCollectionMode", "customerFacingStatusLabel", "customerFacingFinancialAccountType", "operatorFloatAccountId: null", "floatAccountId: null", "TELCO_TOPUPS", "/retail/telco-topups", "/retail/mobile-money", "RetailErpLinks"]) check(operator.includes(marker), \`Operator contract lost marker: \${marker}\`);\n\nconst mobile = read(targets[2]);\nfor (const marker of ["MobileMoneyCashSessionManager", "customerFacingMobileMoneyTransactionType", "customerFacingFeeCollectionMode", "floatAccountId: null", "/retail/mobile-money", "/retail/mobile-money/fx", "RetailErpLinks"]) check(mobile.includes(marker), \`Mobile Money contract lost marker: \${marker}\`);\ncheck(mobile.includes("customerFacingError"), "Mobile Money configuration errors must be customer-facing sanitized.");\n\nconst cash = read(targets[3]);\nfor (const marker of ["/retail/cash-sessions", "PENDING_VALIDATION", "moduleCode", "TELCO_TOPUPS", "MOBILE_MONEY_AGENCY", "RetailMutation"]) check(cash.includes(marker), \`Cash-session contract lost marker: \${marker}\`);\n\nfor (const file of [targets[1], targets[2], targets[3]]) {\n  const source = read(file);\n  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);\n  function visitCopy(node) {\n    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "COPY" && node.initializer) {\n      const text = node.initializer.getText(sf);\n      check(!/(?:operationTitle|title|description|active|openSessions)\\s*:\\s*["']/.test(text), \`\${file}: local COPY still owns customer-visible literal strings.\`);\n    }\n    ts.forEachChild(node, visitCopy);\n  }\n  visitCopy(sf);\n}\n\nconst shared = read("components/enterprise/professional/retail-workspace-shared.tsx");\ncheck(shared.includes('locale: "fr" | "en"'), "Shared Retail money formatter must require an explicit locale.");\ncheck(!shared.includes("document.documentElement.lang"), "Shared Retail money formatter still contains the historical DOM-language fallback.");\n\nconst legacySchema = ["prisma/schema.prisma", "prisma/enterprise-retail.prisma"].filter((file) => fs.existsSync(path.join(root, file))).map(read).join("\\n");\ncheck(!legacySchema.includes("#367"), "#367 must not introduce an i18n schema workaround.");\n\nif (failures.length) {\n  console.error("Retail operator i18n #367 QA failed:");\n  for (const failure of failures) console.error(\`- \${failure}\`);\n  process.exit(1);\n}\nconsole.log(\`Retail operator i18n #367 QA passed: \${frKeys.length} canonical FR/EN keys, explicit locale formatting and operator business contracts preserved.\`);\n`;
write("scripts/qa-retail-operator-i18n-367.mjs", qa);

console.log(`Codex #367 rewrite completed. Retail catalog now has ${Object.keys(fr).length} canonical keys.`);
