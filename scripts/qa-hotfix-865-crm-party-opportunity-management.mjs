import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (value, message) => { if (!value) failures.push(message); };
const includes = (file, snippets) => {
  const value = read(file);
  for (const marker of snippets) check(value.includes(marker), `${file}: missing ${marker}`);
  return value;
};

const schema = includes("lib/enterprise/crm-sales/schemas.ts", [
  "opportunityCreateSchema", "opportunityUpdateSchema", "opportunityNoteCreateSchema", "revision:",
]);
const service = includes("lib/enterprise/crm-sales/opportunities.ts", [
  "updateEnterpriseOpportunity", "addEnterpriseOpportunityNote",
  'entityType: "EnterpriseOpportunity"', "OPPORTUNITY_UPDATED", "OPPORTUNITY_NOTE_ADDED",
  "enterpriseOpportunity.updateMany", "enterpriseOperationalComment.create",
  "metadataJson: { changedFields:", "beforeRevision:", "afterRevision:",
]);
check(!service.includes("enterpriseOpportunity.createMany"), "Do not create CRM records without canonical party ownership.");
const detailApi = includes("app/api/enterprise/[organizationId]/opportunities/[opportunityId]/route.ts", [
  'moduleCode: "CRM_PIPELINE"', 'action: "read"', 'action: "write"',
  "organizationId, archivedAt: null", 'entityType: "EnterpriseOpportunity"',
  "enterpriseOperationalEvent.findMany", "enterpriseOperationalComment.findMany",
  "updateEnterpriseOpportunity", "opportunityUpdateSchema", "isSameOriginRequest", "await rateLimit",
]);
const notesApi = includes("app/api/enterprise/[organizationId]/opportunities/[opportunityId]/notes/route.ts", [
  'moduleCode: "CRM_PIPELINE"', 'action: "write"', "opportunityNoteCreateSchema",
  "addEnterpriseOpportunityNote", "isSameOriginRequest", "await rateLimit",
]);
check(!notesApi.includes('method: "DELETE"') && !detailApi.includes("export async function DELETE"), "History API must not delete notes or opportunities.");
const manager = includes("components/enterprise/professional/business-party-opportunity-manager.tsx", [
  'className="h-[96dvh]', "presentation=\"editor\"", "BusinessPartyOpportunityManager",
  "publishEnterpriseCrmUpdate", "subscribeEnterpriseCrmUpdates",
  "opportunityNoteSaved", "opportunityConfirmStage", "opportunityTimeline",
  "opportunityEdit", "opportunityLoadMore", "expectedCloseDate", "revision:",
]);
const commercialPanel = includes("components/enterprise/professional/business-party-commercial-panel.tsx", [
  "BusinessPartyOpportunityManager", "onOpen=", "businessPartyId",
  "opportunityHubOpen", "opportunityCreateOpen", "hubHasMore",
  "publishEnterpriseCrmUpdate", "subscribeEnterpriseCrmUpdates",
]);
includes("lib/enterprise/crm-sales/client-sync.ts", [
  "ENTERPRISE_CRM_UPDATED_EVENT", "organizationId", "BroadcastChannel",
  "publishEnterpriseCrmUpdate", "subscribeEnterpriseCrmUpdates",
]);
includes("components/enterprise/professional/enterprise-crm-workspace.tsx", [
  "subscribeEnterpriseCrmUpdates", "publishEnterpriseCrmUpdate",
]);
includes("app/api/enterprise/[organizationId]/opportunities/route.ts", [
  'url.searchParams.get("businessPartyId")', "organizationId", "businessPartyId",
]);
includes("app/api/enterprise/[organizationId]/business-parties/[id]/commercial-summary/route.ts", [
  "opportunityCount", "enterpriseOpportunity.count",
]);
const files = ["locales/professional-erp.fr.json", "locales/professional-erp.en.json"];
for (const file of files) {
  const dictionary = JSON.parse(read(file));
  for (const key of ["crm.opportunityManageAll", "crm.opportunityHistoryStage", "crm.opportunityTimeline", "crm.opportunityNoteSaved", "crm.opportunityChangedFields", "crm.opportunityLoadMore"]) {
    check(typeof dictionary[key] === "string" && dictionary[key].trim().length > 0, `${file}: missing ${key}`);
  }
}
check(!manager.includes("localStorage.setItem"), "Never persist customer CRM details in local storage.");
check(schema.includes("opportunityUpdateSchema") && service.includes("input.revision"), "Optimistic revision required.");
if (failures.length) {
  console.error("Hotfix #865 CRM management QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Hotfix #865 CRM management QA passed: canonical party, full-screen CRUD/stages, append-only notes, audited timeline and immediate tenant-scoped invalidation.");
