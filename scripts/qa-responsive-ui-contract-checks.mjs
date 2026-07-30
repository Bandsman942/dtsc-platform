import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const ok = (condition, message) => {
  if (!condition) failures.push(message);
};
const includesAll = (file, snippets) => {
  const content = read(file);
  for (const snippet of snippets) ok(content.includes(snippet), `${file}: missing ${snippet}`);
  return content;
};

const layout = includesAll("app/layout.tsx", [
  "data-dtsc-responsive-root",
  "min-w-0",
  "max-w-full",
  "overflow-x-clip",
]);
ok(!layout.includes("w-screen"), "Root layout must not force a 100vw body width that can include scrollbar or browser chrome.");

const stability = includesAll("app/mobile-stability.css", [
  "[data-dtsc-responsive-root]",
  "overflow-x: clip",
  "overflow-wrap: anywhere",
  "[data-responsive-actions]",
  "grid-template-columns: repeat(2, minmax(0, 1fr))",
  "[data-module-workspace]",
  "[data-business-list-item]",
]);
ok(stability.includes("@supports not (overflow: clip)"), "Responsive root requires an overflow-x hidden fallback for older browsers.");
ok(!stability.includes("width: 100vw"), "Global responsive contract must not use 100vw for ordinary page content.");

const workspace = includesAll("components/workspace/module-workspace.tsx", [
  "data-responsive-scope",
  "w-full min-w-0 max-w-full",
  "overflow-x-clip",
  "data-responsive-actions",
  "grid-cols-[minmax(0,1fr)]",
  "data-workspace-section-body",
]);
ok(workspace.includes("sm:flex-nowrap"), "Section headers must wrap on mobile before switching to a denser desktop layout.");

const businessList = includesAll("components/workspace/business-list.tsx", [
  "w-full min-w-0 max-w-full",
  "overflow-x-clip",
  "[overflow-wrap:anywhere]",
  "data-business-list-item",
]);

const workflowWorkspace = read("components/enterprise/core-v2/enterprise-workflows-workspace.tsx");
ok(workflowWorkspace.includes("min-w-0"), "Workflow workspace must keep shrinkable grid/flex children.");
ok(workflowWorkspace.includes("flex flex-wrap gap-2"), "Workflow actions must wrap instead of forcing the mobile viewport wider.");
ok(!workflowWorkspace.includes("whitespace-nowrap"), "Workflow workspace must not force long labels or technical identifiers onto one line.");

const agents = includesAll("AGENTS.md", [
  "Contrat responsive obligatoire",
  "320, 360, 375, 390, 414, 768 et 1024 px",
  "minmax(0, 1fr)",
  "overflow-wrap:anywhere",
  "qa:responsive-ui",
]);

const architecture = includesAll("docs/UI_UX_ARCHITECTURE.md", [
  "Contrat responsive obligatoire",
  "data-dtsc-responsive-root",
  "data-responsive-actions",
  "qa:responsive-ui",
]);

const packageJson = read("package.json");
ok(packageJson.includes("qa:responsive-ui"), "package.json must expose qa:responsive-ui.");
ok(packageJson.includes("qa-responsive-ui-contract-checks.mjs"), "Responsive contract QA must run inside qa:regression.");

if (failures.length) {
  console.error(`Responsive UI contract QA failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Responsive UI contract QA passed: global root, shared workspace primitives, long-content wrapping, mobile action layout, documentation and CI guard are present.");
