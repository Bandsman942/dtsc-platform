import fs from "node:fs";

const checks = [];

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function expect(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
}

const dashboard = read("components/activities/activities-dashboard.tsx");
const detail = read("components/activities/activity-detail.tsx");
const forms = read("components/activities/activity-forms.tsx");
const workspace = read("components/workspace/module-workspace.tsx");
const metrics = read("components/workspace/module-metrics.tsx");
const businessList = read("components/workspace/business-list.tsx");
const actions = read("components/workspace/context-actions.tsx");
const actionMenu = read("components/ui/action-menu.tsx");
const activitiesPage = read("app/activities/page.tsx");
const agents = read("AGENTS.md");
const uiDocs = read("docs/UI_UX_ARCHITECTURE.md");

expect("workspace composition primitives exist", workspace.includes("ModuleWorkspace") && workspace.includes("ModuleHeader") && workspace.includes("ModuleToolbar") && workspace.includes("ModuleSection"));
expect("workspace prevents page horizontal overflow", workspace.includes("overflow-x-hidden") && workspace.includes("safe-area-inset-bottom"));
expect("metrics use compact mobile horizontal strip", metrics.includes("overflow-x-auto") && metrics.includes("sm:grid") && !metrics.includes("dtsc-card"));
expect("business list is row/separator based", businessList.includes("divide-y") && businessList.includes("BusinessListItem") && !businessList.includes("dtsc-card"));
expect("context actions reuse shared ActionMenu", actions.includes("ActionMenu") && actions.includes("hidden") && actions.includes("separatorBefore"));
expect("ActionMenu keeps Sprint 1 visualViewport hardening", actionMenu.includes("window.visualViewport") && actionMenu.includes("zIndex: 1200") && actionMenu.includes('className="fixed z-[1000]'));
expect("Activities uses reusable workspace primitives", dashboard.includes("ModuleWorkspace") && dashboard.includes("ModuleHeader") && dashboard.includes("ModuleToolbar") && dashboard.includes("ModuleMetrics") && dashboard.includes("BusinessList"));
expect("Activities reuses ListControls with useSmartList", dashboard.includes("ListControls") && dashboard.includes("useSmartList"));
expect("Activities no longer uses top-level DTSC card wrappers", !dashboard.includes("dtsc-panel") && !dashboard.includes("dtsc-card"));
expect("Activities keeps global search and date filters", dashboard.includes("matchesFilters") && dashboard.includes('type="date"') && dashboard.includes("normalizeSearch"));
expect("Activities keeps centralized collaborative request form", dashboard.includes("RequestDialog") && forms.includes('/api/activities/requests'));
expect("Activities keeps real blocker/report/workflow APIs", forms.includes('/api/activities/blockers') && forms.includes('/api/activities/reports') && forms.includes('/api/activities/collaborator-workflows'));
expect("Activity details keep comments and task/request mutations", detail.includes('/api/activities/comments') && detail.includes('/api/activities/tasks/') && detail.includes('/api/activities/requests/'));
expect("terminal tasks do not expose invalid detail mutations", detail.includes("TERMINAL_TASK_STATUSES") && detail.includes("isMutableTask") && detail.includes('item.status !== "IN_PROGRESS"'));
expect("Activity page keeps DTSC internal session guard", activitiesPage.includes("isDtscInternalSession") && activitiesPage.includes("normalizePositionCode"));
expect("Activities does not implement fake archive/delete actions", !dashboard.includes('label: "Archiver"') && !dashboard.includes('label: "Supprimer"'));
expect("AGENTS codifies reusable workspace rules", agents.includes("UI/UX métier DTSC") && agents.includes("components/workspace/*") && agents.includes("permission serveur"));
expect("UI architecture documentation exists", uiDocs.includes("ModuleWorkspace") && uiDocs.includes("ContextActions") && uiDocs.includes("Généralisation future"));

let failed = 0;
for (const check of checks) {
  if (check.ok) {
    console.log(`PASS ${check.name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${check.name}`);
  }
}

if (failed) {
  console.error(`\n${failed} workspace UI check(s) failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} workspace UI checks passed.`);
