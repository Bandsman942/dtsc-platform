import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const authorize = read("lib/ai/tools/authorize.ts");
const confirmation = read("lib/ai/tools/confirmation.ts");
const pending = read("app/api/ai/tools/pending/route.ts");
const cancel = read("app/api/ai/tools/cancel/route.ts");
const pharmacyData = read("lib/enterprise-ai/pharmacy-tool-data.ts");
const privateActions = read("lib/private-chat-actions.ts");

if (!authorize.includes("context.session.activeOrganizationId !== organizationId")) failures.push("authorization must reject mismatched active tenant");
if (!confirmation.includes('"organizationId" IS NOT DISTINCT FROM ${input.context.organizationId || null}')) failures.push("confirmation lookup/transition must be tenant bound");
if (!pending.includes('"organizationId" IS NOT DISTINCT FROM ${organizationId}')) failures.push("pending confirmation list must be tenant bound");
if (!cancel.includes('"organizationId" IS NOT DISTINCT FROM ${organizationId}')) failures.push("confirmation cancellation must be tenant bound");
if (!privateActions.includes("session.activeOrganizationId !== organizationId")) failures.push("private action preparation must reject stale enterprise context");
for (const model of ["pharmacyProduct", "pharmacyBatch", "pharmacyAlert", "pharmacySale", "pharmacyCashSession", "pharmacyPurchaseOrder", "pharmacyQualityIncident", "pharmacyDocument"]) {
  const index = pharmacyData.indexOf(`prisma.${model}`);
  if (index < 0) failures.push(`missing Pharmacy loader ${model}`);
  else if (!pharmacyData.slice(index, index + 700).includes("organizationId")) failures.push(`${model} loader must remain organization scoped`);
}

if (failures.length) {
  console.error("AI tool tenant isolation QA failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("AI tool tenant isolation QA passed");
}
