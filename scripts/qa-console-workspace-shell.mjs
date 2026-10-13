import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (name) => readFileSync(path.join(root, name), "utf8");
const page = read("app/admin/console-page.tsx");
const shell = read("components/admin/console-workspace-shell.tsx");
const nav = read("components/admin/admin-floating-nav.tsx");
const productNav = read("components/workspace/product-section-navigation.tsx");
const routes = read("lib/console/console-routes.ts");
const maturity = read("app/admin/module-maturity/page.tsx");
const fr = JSON.parse(read("locales/fr.json"));
const en = JSON.parse(read("locales/en.json"));

assert.match(page, /<ConsoleWorkspaceShell/);
assert.match(page, /sections=\{visibleSections\.map\(\(id\) =>/);
assert.match(page, /getConsoleAccessDecision/);
assert.match(page, /canAccessAdminSection/);
assert.doesNotMatch(page, /<AdminFloatingNav|<nav className="hidden min-w-0 grid-cols|<section className="dtsc-panel/);
assert.match(shell, /<ModuleWorkspace/);
assert.match(shell, /<ModuleContent/);
assert.match(shell, /canViewAccess \? \(/);
assert.match(shell, /getSupportUrl\(\)/);
assert.match(nav, /locale: "fr" \| "en"/);
assert.match(nav, /title=\{activeLabel\}/);
assert.match(nav, /description=\{activeDescription\}/);
assert.match(nav, /relatedSections\.map/);
assert.doesNotMatch(nav, /<style jsx global>|dtsc-private-main|const locale = sections\.some/);
assert.match(productNav, /compactDesktop\?: boolean/);
assert.match(productNav, /compactDesktop \? \(/);
assert.match(productNav, /useFloatingAction/);
assert.match(routes, /"module-maturity"/);
assert.match(maturity, /listCommercialMaturityCards/);
for (const translations of [fr, en]) {
  for (const key of ["tabs", "allSections", "resources", "guide", "support", "access"]) {
    assert.ok(translations.console.workspace[key], `missing console.workspace.${key}`);
  }
}
console.log("Console workspace shell structural contract: PASS");
