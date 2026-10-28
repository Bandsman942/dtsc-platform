import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const focus = read("lib/client-focus-management.ts");
const dialog = read("components/ui/dialog.tsx");
const workspace = read("components/workspace/module-workspace.tsx");
const actions = read("components/ui/action-menu.tsx");
const productMenu = read("components/layout/product-navigation-menu.tsx");
const back = read("components/workspace/contextual-back-button.tsx");

assert.match(focus, /event\.key !== "Tab"/);
assert.match(focus, /event\.shiftKey/);
assert.match(focus, /isTopmostModal/);
assert.match(dialog, /aria-modal="true"/);
assert.match(dialog, /aria-describedby=\{description \?/);
assert.match(dialog, /containModalTab\(event, overlay\)/);
assert.match(dialog, /previouslyFocused\.focus/);
assert.match(workspace, /role="dialog"/);
assert.match(workspace, /containModalTab\(event, section\)/);
assert.match(workspace, /data-workspace-section-back/);
for (const menu of [actions, productMenu]) {
  assert.match(menu, /ArrowDown/);
  assert.match(menu, /ArrowUp/);
  assert.match(menu, /Home/);
  assert.match(menu, /End/);
  assert.match(menu, /triggerRef\.current\?\.focus/);
  assert.match(menu, /role="menuitem"/);
}
assert.match(back, /dtsc:form-saved/);
assert.match(back, /data-navigation-filter-form/);

console.log("PASS UX-01: modal focus, keyboard menus, workspace overlay and explicit form reset contract");
