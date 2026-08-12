import "./qa-experience-debt-closure.mjs";
import "./qa-smooth-mobile-group-swipe.mjs";
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

includesAll("components/workspace/business-list.tsx", [
  "w-full min-w-0 max-w-full",
  "overflow-x-clip",
  "[overflow-wrap:anywhere]",
  "data-business-list-item",
]);

const sharedButton = includesAll("components/ui/button.tsx", [
  "h-auto",
  "min-h-10",
  "whitespace-normal",
  "focus-visible:ring",
  "active:translate-y-px",
]);
ok(!sharedButton.includes('default: "h-9 '), "Shared Button must not combine a fixed default height with wrapped labels.");

const mobileShell = includesAll("components/dtsc/mobile-shell.tsx", [
  "data-mobile-system-rail",
  "data-mobile-bottom-nav",
  "data-horizontal-rail",
  'if (groupCode === "PILOTAGE") return 0',
]);
ok(!mobileShell.includes("QuickChip"), "Top mobile chrome must not duplicate the bottom primary navigation.");

const workflowWorkspace = read("components/enterprise/core-v2/enterprise-workflows-workspace.tsx");
ok(workflowWorkspace.includes("min-w-0"), "Workflow workspace must keep shrinkable grid/flex children.");
ok(workflowWorkspace.includes("flex flex-wrap gap-2"), "Workflow actions must wrap instead of forcing the mobile viewport wider.");
ok(!workflowWorkspace.includes("whitespace-nowrap"), "Workflow workspace must not force long labels or technical identifiers onto one line.");

const toolbox = includesAll("components/productivity/professional-toolbox-v2.tsx", [
  'presentation="editor"',
  "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
  'className="rounded-none border-0"',
  "sm:hidden",
]);
ok(!toolbox.includes("min-h-[24rem]"), "Toolbox rich editor must not force a minimum height larger than the visual viewport when the software keyboard is open.");
ok(!toolbox.includes("h-[calc(var(--dtsc-dialog-visual-height,100dvh)-10rem)]"), "Toolbox rich editor must flex inside the keyboard-safe dialog instead of computing a competing viewport height.");

const richEditor = includesAll("components/productivity/professional-note-rich-editor.tsx", [
  "flex min-h-0 flex-1 flex-col overflow-hidden",
  "min-h-0 min-w-0 flex-1 touch-pan-y",
  "overflow-y-auto",
  "text-[16px]",
]);
ok(!richEditor.includes("min-h-[18rem]"), "The editable note surface must be allowed to shrink below 18rem when the software keyboard reduces the visual viewport.");

includesAll("components/ui/dialog.tsx", [
  'presentation?: "default" | "editor"',
  "data-dtsc-dialog-presentation={presentation}",
  'height: "calc(var(--dtsc-dialog-visual-height, 100dvh) - 1rem)"',
  'isEditorPresentation && "hidden sm:block"',
  "grid grid-cols-2 gap-2",
]);

for (const agentsFile of ["app/AGENTS.md", "components/AGENTS.md"]) {
  includesAll(agentsFile, [
    "Contrat responsive obligatoire",
    "320, 360, 375, 390, 414, 768 et 1024 px",
    "minmax(0, 1fr)",
    "overflow-wrap:anywhere",
    "qa:responsive-ui",
  ]);
}

includesAll("docs/RESPONSIVE_UI_CONTRACT.md", [
  "Contrat responsive obligatoire",
  "data-dtsc-responsive-root",
  "data-responsive-actions",
  "qa:responsive-ui",
  "Swipe de groupe fluide",
  "320 px",
  "1024 px",
]);

const packageJson = read("package.json");
ok(packageJson.includes("qa:responsive-ui"), "package.json must expose qa:responsive-ui.");
ok(packageJson.includes("qa-responsive-ui-contract-checks.mjs"), "Responsive contract QA must run inside qa:regression.");
ok(read("scripts/qa-responsive-ui-contract-checks.mjs").includes('import "./qa-experience-debt-closure.mjs"'), "Experience debt closure QA must run through the canonical responsive regression gate.");
ok(read("scripts/qa-responsive-ui-contract-checks.mjs").includes('import "./qa-smooth-mobile-group-swipe.mjs"'), "Fluid mobile group swipe QA must run through the canonical responsive regression gate.");

if (failures.length) {
  console.error(`Responsive UI contract QA failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Responsive UI contract QA passed: global root, shared workspace primitives, resilient buttons, keyboard-safe toolbox editor, long-content wrapping, deduplicated mobile navigation, fluid group swipe, scoped AGENTS rules, documentation and CI guards are present.");
