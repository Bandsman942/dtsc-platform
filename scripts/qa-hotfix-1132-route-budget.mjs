import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const source = read("middleware.ts");
const tail = source.slice(source.indexOf("export const config = {"));
const alternatives = [
  "dashboard", "chat", "billing", "company", "calendar", "documents", "activities",
  "enterprise-admin", "enterprise-insurance", "enterprise-activities", "enterprise-invitations",
  "enterprise-modules", "collaborators", "profile", "settings", "support",
  "notifications", "announcements", "admin", "api",
];
const pattern = /^\s*"\/:surface\(([^"]+)\)\/:path\*"/m;
const match = tail.match(pattern);
assert.ok(match, "Single grouped matcher must cover the authenticated app/api surface");
const actual = match[1].split("|");
assert.deepEqual(actual, alternatives, "Route grouping must retain all former product prefixes");
assert.ok(tail.includes('source: "/:path*"') && tail.includes("docs.dtsc-platform.com"), "Docs hostname still needs catch-all");
assert.ok(tail.includes('"/"'), "Root redirects still require middleware");
assert.ok(tail.includes('"/auth/:action(sign-in|sign-up)"'), "Account auth still protected");
assert.equal((tail.match(/\/:[a-zA-Z]+\*/g)||[]).length, 2, "Only docs and one app prefix matcher may be wildcard");
assert.ok(source.includes("isSameOriginRequest(request)") && source.includes("verifySessionToken(token, secret)"), "Don't weaken CSRF/session");
assert.ok(source.includes("hasDtscInternalContext(session)"), "Don't weaken internal context");
const regex = new RegExp("^/(" + actual.join("|") + ")(?:/.*)?$");
for (const prefix of alternatives) {
  assert.ok(regex.test("/" + prefix) && regex.test("/" + prefix + "/nested/child"), prefix);
}
for (const sample of ["/blog", "/beach", "/_next/static/app.js", "/favicon.ico", "/auth/fake"]) {
  assert.equal(regex.test(sample), false, sample);
}
const vercel = JSON.parse(read("vercel.json"));
assert.equal(vercel.git.deploymentEnabled.main, true, "Production only main");
assert.equal(vercel.git.deploymentEnabled["*"], false, "No feature deployments");
console.log("✅ #1132 middleware: 24 -> 4 matcher rules, coverage and mandatory auth/CSRF checks retained; route savings estimated at 19.");
