import fs from "node:fs";

function appendSection(file, marker, section) {
  let content = fs.readFileSync(file, "utf8");
  if (content.includes(marker)) return;
  if (!content.endsWith("\n")) content += "\n";
  content += `\n${section.trim()}\n`;
  fs.writeFileSync(file, content);
}

const packagePath = "package.json";
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
pkg.scripts = pkg.scripts || {};
Object.assign(pkg.scripts, {
  "qa:standard-ai-tool-runtime": "node scripts/qa-standard-ai-tool-gateway.mjs",
  "qa:standard-ai-tool-authorization": "node scripts/qa-standard-ai-tool-authorization.mjs",
  "qa:standard-ai-tool-confirmation": "node scripts/qa-standard-ai-tool-confirmation.mjs",
  "qa:standard-ai-tool-idempotency-runtime": "node scripts/qa-standard-ai-tool-idempotency-runtime.mjs",
  "qa:standard-ai-tool-tenant-isolation": "node scripts/qa-standard-ai-tool-tenant-isolation.mjs"
});
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

const guidesPath = "lib/user-guides/iteration05-guides.ts";
let guides = fs.readFileSync(guidesPath, "utf8");
function patchGuideBlock(startNeedle, endNeedle, updater) {
  const start = guides.indexOf(startNeedle);
  const end = guides.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0) throw new Error(`GUIDE_BLOCK_NOT_FOUND:${startNeedle}`);
  const before = guides.slice(0, start);
  const block = guides.slice(start, end);
  const after = guides.slice(end);
  guides = before + updater(block) + after;
}
patchGuideBlock('  AI_TOOLS_AND_CONFIRMATIONS: {\n    code: "AI_TOOLS_AND_CONFIRMATIONS",\n    title: "Guide des outils IA et confirmations",', '  AI_PRIVACY_AND_SECURITY: {', (block) => {
  let next = block.replace('updatedAt: "2026-08-04"', 'updatedAt: "2026-08-10"');
  next = next.replace('capabilities: ["Registre canonique des outils",', 'capabilities: ["Confirmation structurelle liée au tour", "Registre canonique des outils",');
  next = next.replace('{ title: "Confirmation", description: "Avant une action sensible, vérifiez l’objet, les effets, les destinataires, les données modifiées et les risques." },', '{ title: "Confirmation", description: "Avant une mutation, vérifiez l’objet, les effets, les destinataires et les données impactées, puis utilisez exclusivement le contrôle Confirmer/Annuler affiché par DTSC.", cautions: ["Écrire oui, ok ou vas-y dans le chat ne confirme jamais l’exécution.", "Une confirmation expirée ou liée à un autre contexte doit être recréée."] },');
  return next;
});
patchGuideBlock('  AI_TOOLS_AND_CONFIRMATIONS: {\n    code: "AI_TOOLS_AND_CONFIRMATIONS",\n    title: "AI tools and confirmations guide",', '  AI_PRIVACY_AND_SECURITY: {', (block) => {
  let next = block.replace('updatedAt: "2026-08-04"', 'updatedAt: "2026-08-10"');
  next = next.replace('capabilities: ["Canonical tool registry",', 'capabilities: ["Turn-bound structural confirmation", "Canonical tool registry",');
  next = next.replace('{ title: "Confirm", description: "Before a sensitive action, review the object, effects, recipients, modified data and risks." },', '{ title: "Confirm", description: "Before a mutation, review the object, effects, recipients and impacted data, then use only the DTSC Confirm/Cancel control.", cautions: ["Typing yes, ok or go ahead in chat never confirms execution.", "An expired or context-mismatched confirmation must be prepared again."] },');
  return next;
});
fs.writeFileSync(guidesPath, guides);

appendSection(
  "docs/STANDARD_AI_ORCHESTRATION_ARCHITECTURE.md",
  "## Tool Gateway — AI06",
  `## Tool Gateway — AI06

AI06 separates model reasoning from execution authority. A provider or deterministic selector may propose a tool code and arguments, but only the DTSC Tool Gateway can authorize and execute it.

The execution chain is:

\`tool proposal → AI_TOOL_REGISTRY → Zod input validation → authorizeAiTool() → confirmation policy → idempotency claim → explicit executor → Zod output validation → audit/result\`.

Pharmacy currently keeps a deterministic keyword selector as a documented transitional fallback. It has no authority: every selected code still crosses the same Gateway. Structured provider tool calls can replace selection later without changing the authorization/execution boundary.

Mutations are structurally confirmed through \`AiToolConfirmation\`; free-form text such as \`oui/yes/ok\` is never proof of consent. \`AiToolExecution\` owns transversal execution identity and idempotency. AI06 does not certify payment, accounting or clinical mutations, and MCP remains reserved for AI07.`
);

appendSection(
  "docs/TECHNICAL_DOCUMENTATION.md",
  "## AI06 — DTSC Tool Gateway",
  `## AI06 — DTSC Tool Gateway

AI06 introduces the canonical Tool Gateway on top of \`lib/ai/tool-registry.ts\`. Certified tools require an explicit registry definition, runtime Zod schemas, an explicit executor and centralized authorization. Pharmacy READ tools are migrated behind the Gateway; private support-ticket and DTSC-contact-email actions are mutations requiring a turn-bound structural confirmation.

The additive migration \`20260810002000_ai_tool_gateway_confirmation_idempotency\` creates \`AiToolConfirmation\` and \`AiToolExecution\`. Idempotency is protected by a unique database scope key and an atomic \`ON CONFLICT ... DO NOTHING RETURNING id\` execution claim. Pending confirmations expose only sanitized previews to the browser. The canonical Prisma representation lives in \`prisma/standard-ai-governance.prisma\`, consistent with the repository's multi-file Prisma schema.

Dedicated AI06 QA covers runtime registry integrity, authorization, structural confirmation, idempotency, tenant isolation and private-action bypass prevention. The five official package commands are \`qa:standard-ai-tool-runtime\`, \`qa:standard-ai-tool-authorization\`, \`qa:standard-ai-tool-confirmation\`, \`qa:standard-ai-tool-idempotency-runtime\` and \`qa:standard-ai-tool-tenant-isolation\`.`
);

appendSection(
  "docs/CHANGELOG.md",
  "### AI06 — DTSC Tool Gateway",
  `### AI06 — DTSC Tool Gateway

- Added the canonical Tool Gateway runtime backed by \`AI_TOOL_REGISTRY\`, Zod I/O validation, centralized authorization and explicit executors.
- Migrated nine Pharmacy READ capabilities behind the Gateway while keeping deterministic selection only as a temporary non-authoritative fallback.
- Migrated private support-ticket and DTSC-contact-email mutations to structural Confirm/Cancel controls; natural-language approval is non-authoritative.
- Added turn/tenant/tool/argument-hash-bound confirmations, single-use consumption and database-enforced idempotent execution claims.
- Added responsive FR/EN confirmation UX and five dedicated AI06 QA commands plus regression integration.
- Added additive Prisma persistence for \`AiToolConfirmation\` and \`AiToolExecution\`; no payment, accounting or clinical mutation is enabled by AI06.`
);

console.log("AI06 docs, user guides, and package QA commands synchronized");
