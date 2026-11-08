import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const standardHub = read("app/modules/page.tsx");
const erpHub = read("app/enterprise-modules/page.tsx");
const grid = read("components/workspace/module-navigation-grid.tsx");
const pos = read("components/enterprise/professional/retail-pos-section-navigation.tsx");
const shell = read("components/layout/app-shell.tsx");
const progress = read("components/layout/navigation-progress.tsx");
const skeleton = read("components/workspace/module-navigation-loading.tsx");
const standardLoading = read("app/modules/loading.tsx");
const erpLoading = read("app/enterprise-modules/loading.tsx");
const erpDetailLoading = read("app/enterprise-modules/[moduleCode]/loading.tsx");

// Both canonical hubs have the exact same presentation. Do not change business lists.
for (const [name, source] of [["standard", standardHub], ["ERP", erpHub]]) {
  assert.match(source, /<ModuleNavigationGrid/, `${name}: shared cards missing`);
  assert.doesNotMatch(source, /<BusinessList/, `${name}: old vertical navigation list`);
}
assert.match(standardHub, /listStandardNavigationItems/);
assert.match(standardHub, /standardCodeAllowed/);
assert.match(erpHub, /getEnterpriseNavigationModules\(organizationId, user\.id, user\.locale\)/);
assert.match(erpHub, /getFinanceNavigationSectionCode/);
assert.match(erpHub, /implementationStatus === "BETA"/);
assert.match(grid, /data-enterprise-module-code=\{item\.code\}/);
assert.match(grid, /href=\{item\.href\}/);
assert.match(grid, /item\.icon/);
assert.match(grid, /aria-busy=\{pending\}/);
assert.match(grid, /aria-live="polite"/);
assert.match(grid, /grid-cols-\[minmax\(0,1fr\)\] gap-3 sm:grid-cols-2 xl:grid-cols-3/);
assert.match(grid, /focus-visible:ring-2/);
assert.match(pos, /data-retail-pos-card/);
assert.match(pos, /group flex min-h-28 min-w-0 items-start gap-3/);
assert.match(grid, /group flex min-h-28 min-w-0 items-start gap-3/);
assert.match(shell, /<NavigationProgress locale=\{user\.locale\}/);
assert.match(progress, /document\.addEventListener\("click"/);
assert.match(progress, /url\.origin !== window\.location\.origin/);
assert.match(progress, /window\.setTimeout/);
assert.match(progress, /Retry/);
assert.match(skeleton, /aria-busy="true"/);
assert.match(standardLoading, /<ModuleNavigationLoading/);
assert.match(erpLoading, /<ModuleNavigationLoading/);
assert.match(erpDetailLoading, /<ModuleNavigationLoading/);
console.log("PASS #1055: POS-style cards, canonical RBAC navigation, mobile accessibility and slow-route states");
