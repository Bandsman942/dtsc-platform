import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hub = readFileSync("app/enterprise-modules/page.tsx", "utf8");
const quick = readFileSync("components/enterprise/enterprise-quick-access.tsx", "utf8");
const nav = readFileSync("lib/enterprise/enterprise-navigation.ts", "utf8");

assert.match(hub, /getEnterpriseNavigationModules\(organizationId, user\.id, user\.locale\)/);
assert.match(hub, /<EnterpriseQuickAccess/);
assert.match(hub, /activeOrganizationRole=\{session\.activeOrganizationRole\}/);
assert.match(hub, /data-enterprise-module-code=\{enterpriseModule\.code\}/);
assert.match(quick, /new Map\(modules\.map/);
assert.match(quick, /allowed\.has\(code\)/);
assert.match(quick, /dtsc:erp-shortcuts:v1:\$\{organizationId\}:\$\{userId\}/);
assert.match(quick, /window\.localStorage/);
assert.match(quick, /<input type="search"/);
assert.match(quick, /aria-pressed=\{isFavorite\}/);
assert.match(quick, /activeOrganizationRole/);
assert.match(quick, /href=\{module\.href\}/);
assert.match(nav, /listNavigableEnterpriseModules/);
console.log("PASS UX-04: quick access uses tenant/user-scoped favorites and canonical authorized module list");
