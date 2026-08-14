import fs from "node:fs";

const shellPath = "components/collaborators/collaborators-immersive-conversation-shell.tsx";
const composerPath = "components/chat/VoiceConversationComposer.tsx";
const viewportPath = "components/chat/use-immersive-conversation-viewport.ts";

for (const path of [shellPath, composerPath, viewportPath]) {
  if (!fs.existsSync(path)) {
    console.error(`FAIL fichier introuvable: ${path}`);
    process.exit(1);
  }
}

const shell = fs.readFileSync(shellPath, "utf8");
const composer = fs.readFileSync(composerPath, "utf8");
const viewport = fs.readFileSync(viewportPath, "utf8");

const requiredShellTokens = [
  'composer.dataset.collaborationComposer = "true"',
  '[data-collaboration-composer="true"] > form {',
  'overflow: hidden;',
  'border-radius: 1.25rem;',
  '[data-collaboration-composer="true"] > form > textarea {',
  'max-height: 6rem !important;',
  'overflow-y: auto !important;',
  'overscroll-behavior: contain;',
  'padding-bottom: calc(0.6rem + env(safe-area-inset-bottom)) !important;',
];
for (const token of requiredShellTokens) {
  if (!shell.includes(token)) {
    console.error(`FAIL contrat compositeur mobile absent: ${token}`);
    process.exit(1);
  }
}

if (/\[data-collaboration-composer="true"\]\s*>\s*form\s*\{[^}]*border-radius:\s*9999px/s.test(shell)) {
  console.error("FAIL le formulaire du compositeur ne doit plus être forcé en ellipse 9999px.");
  process.exit(1);
}

for (const token of [
  'textarea.style.height = "auto"',
  'textarea.style.overflowY = textarea.scrollHeight > MAX_COMPOSER_HEIGHT ? "auto" : "hidden"',
  'aria-label={placeholder}',
]) {
  if (!composer.includes(token)) {
    console.error(`FAIL contrat autosize/accessibilité absent: ${token}`);
    process.exit(1);
  }
}

for (const token of [
  "window.visualViewport?.addEventListener(\"resize\", syncViewport)",
  'privateMainElement.style.height = `${viewportHeight}px`',
  'body.style.overscrollBehavior = "none"',
]) {
  if (!viewport.includes(token)) {
    console.error(`FAIL contrat clavier/VisualViewport absent: ${token}`);
    process.exit(1);
  }
}

console.log("PASS #295 compact mobile collaborator composer contract");
