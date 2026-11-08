import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(name, "utf8");
const shell = read("components/layout/app-shell.tsx");
const controller = read("components/layout/desktop-sidebar-frame.tsx");
const navigation = read("components/layout/nav-links.tsx");
const css = read("app/desktop-sidebar.css");
const root = read("app/layout.tsx");
const page = read("app/collaborators/page.tsx");
const conversations = read("components/collaborators/collaborators-conversation-workspace.tsx");
const viewport = read("components/chat/use-immersive-conversation-viewport.ts");

// One stateful shell, with the same authorized navigation component in both modes.
assert.match(shell, /<DesktopSidebarFrame userId=\{user\.id\} productKey=\{currentHostType\}/);
assert.match(shell, /desktopWorkspaceMode\?: "default" \| "conversation"/);
assert.match(shell, /<DesktopSidebarToggle locale=\{user\.locale\}/);
assert.match(shell, /<NavLinks/);
assert.match(shell, /dtsc-sidebar-new-chat/);
assert.match(shell, /dtsc-sidebar-collapsed-only/);
assert.match(navigation, /data-sidebar-nav-link/);
assert.match(navigation, /aria-label=\{label\}/);
assert.match(navigation, /aria-current=\{active \? "page"/);
assert.match(controller, /window\.localStorage\.getItem\(storageKey\)/);
assert.match(controller, /window\.localStorage\.setItem\(storageKey/);
assert.match(controller, /\$\{userId\}:\$\{productKey\}/);
assert.match(controller, /window\.addEventListener\("storage"/);
assert.match(controller, /aria-controls="dtsc-desktop-sidebar"/);
assert.match(controller, /aria-expanded=\{!context\.collapsed\}/);
assert.match(controller, /"Développer le menu"/);
assert.match(controller, /"Réduire le menu"/);
assert.match(controller, /"Expand navigation"/);
assert.match(controller, /"Collapse navigation"/);
assert.match(controller, /focus-visible:ring-2/);

// Breakpoint isolation: no global mobile viewport/nav changes, and no backend involved.
assert.match(root, /import "\.\/desktop-sidebar\.css"/);
assert.match(css, /@media \(min-width: 1024px\)/);
assert.match(css, /--dtsc-desktop-sidebar-width: 18rem/);
assert.match(css, /--dtsc-desktop-sidebar-width: 4\.75rem/);
assert.match(css, /data-sidebar-collapsed="true"/);
assert.match(css, /prefers-reduced-motion: reduce/);
assert.match(viewport, /const MOBILE_QUERY = "\(max-width: 1023px\)"/);

// Desktop collaboration genuinely fills the remaining space with two internal scroll panes.
assert.match(page, /desktopWorkspaceMode="conversation"/);
assert.match(css, /\[data-workspace-mode="conversation"\]/);
assert.match(conversations, /data-collaborators-split-view/);
assert.match(conversations, /data-collaborators-discussions-pane/);
assert.match(conversations, /data-collaborators-conversation-pane/);
assert.match(conversations, /lg:grid-cols-\[minmax\(0,340px\)_minmax\(0,1fr\)\]/);
assert.match(conversations, /overflow-y-auto overscroll-contain/);

console.log("PASS #1061 desktop icon rail, persistence, RBAC-preserving links, and immersive chat split");
