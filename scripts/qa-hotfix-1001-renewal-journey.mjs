import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const billing = read("app/billing/page.tsx");
const dashboard = read("app/dashboard/page.tsx");
const renewal = read("components/billing/subscription-renewal-actions.tsx");
const plans = read("components/billing/organization-billing-plans.tsx");
const api = read("app/api/billing/renewal-request/route.ts");
const support = read("app/support/page.tsx");

assert.match(dashboard, /showRenewalNotice/);
assert.match(dashboard, /subscriptionRemainingDays <= 30/);
assert.match(dashboard, /billing#renouvellement-entreprise/);
assert.match(dashboard, /canManageOrganizationSubscription/);
assert.match(billing, /ModuleSection id="renouvellement-entreprise"/);
assert.match(billing, /onlineOffersId="offres-renouvellement-entreprise"/);
assert.match(billing, /id="offres-renouvellement-entreprise"/);
assert.match(billing, /onlineOffersId="offres-renouvellement-personnel"/);
assert.match(billing, /status: ticket\.status/);
assert.match(billing, /canViewInSupport: ticket\.userId === user\.id/);
assert.match(billing, /resolution: ticket\.userId === user\.id \? ticket\.resolution : null/);
assert.match(billing, /organization: \{ members: \{ some: \{ userId: user\.id, status: "ACTIVE", removedAt: null, role: \{ in: \["OWNER", "ADMIN"\] \}/);
assert.match(renewal, /!openStatus/);
assert.match(renewal, /paidPlan && !openStatus/);
assert.match(renewal, /paymentAvailable && canManage/);
assert.match(renewal, /\?ticketId=\$\{encodeURIComponent\(shownRequest\.id\)\}/);
assert.match(renewal, /optimisticPending/);
assert.match(renewal, /canViewInSupport: body\.canViewInSupport === true/);
assert.match(renewal, /getSupportUrl/);
assert.match(plans, /paymentAvailable \? <div/);
assert.match(api, /isSameOriginRequest/);
assert.match(api, /ORGANIZATION_ADMIN_REQUIRED/);
assert.match(api, /pg_advisory_xact_lock/);
assert.match(api, /canViewInSupport: ticket\.userId === session\.userId/);
assert.match(support, /where: \{ AND: \[baseWhere, \{ id: params\.ticketId \}]/);
assert.match(support, /focusedTicket && !tickets\.some/);

const french = JSON.parse(read("locales/experience.fr.json"));
const english = JSON.parse(read("locales/experience.en.json"));
assert.deepEqual(Object.keys(french.renewal).sort(), Object.keys(english.renewal).sort());
assert.deepEqual(Object.keys(french.dashboard).sort(), Object.keys(english.dashboard).sort());
for (const key of ["manualAction", "onlineAction", "viewRequest", "paidRequired", "onlineUnavailable", "otherRequester"]) {
  assert.ok(french.renewal[key] && english.renewal[key], `Missing renewal translation ${key}`);
}
console.log("PASS: #1001 renewal entry points, roles, provider state, ticket tracking and FR/EN contracts");
