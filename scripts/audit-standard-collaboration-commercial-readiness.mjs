import fs from "node:fs";

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, message) => { if (!condition) failures.push(message); };

const conversation = read("components/collaborators/collaborators-conversation-workspace.tsx");
const messagesApi = read("app/api/collaborators/groups/[id]/messages/route.ts");
const collaboration = read("lib/collaboration.ts");
const filterApi = read("app/api/collaborators/filters/route.ts");
const filterItemApi = read("app/api/collaborators/filters/[id]/route.ts");
const prismaModel = read("prisma/collaboration-experience.prisma");
const migration = read("prisma/migrations/20260803170000_collaboration_commercial_readiness/migration.sql");
const richEditor = read("components/ui/rich-text-editor.tsx");
const registry = JSON.parse(read("lib/modules/standard-module-registry-data.json"));
const evidencePath = "docs/STANDARD_COLLABORATION_COMMERCIAL_ACCEPTANCE_2026-08-03.md";
const evidence = read(evidencePath);

for (const marker of ["normalizeMessageExternalUrl", "target=\"_blank\"", "noopener noreferrer nofollow"]) expect(conversation.includes(marker), `Messages: lien externe absent ${marker}`);
for (const marker of ["ProfessionalMessageContent", "onMention", "MentionAction", "@tous", "containsMentionAllText"]) expect(conversation.includes(marker), `Mentions UI: capacité absente ${marker}`);
for (const marker of ["containsCollaborationMentionAll", "mention_all_requires_group_management", "Mention @tous", "mentionedUserIds"]) expect(messagesApi.includes(marker), `Mentions serveur: capacité absente ${marker}`);
expect(collaboration.includes("collaborationMessageMention.updateMany") && collaboration.includes("isRead: true") && collaboration.includes("readAt: now"), "Mentions: lecture persistée à l’ouverture absente");
expect(conversation.includes("summary?.allRead") && conversation.includes("text-emerald-300"), "Accusés: état vert lu par tous absent");
expect(conversation.includes('"DIRECT"') && conversation.includes("customFilters") && conversation.includes("saveCustomFilter") && conversation.includes("selectedGroupIds"), "Filtres: directs ou listes personnalisées absents");
for (const marker of ["collaborationConversationFilter", "criteriaJson", "userId: session.userId", "isSameOriginRequest", "rateLimit"]) expect(`${filterApi}\n${filterItemApi}`.includes(marker), `Filtres API: invariant absent ${marker}`);
expect(prismaModel.includes("model CollaborationConversationFilter") && migration.includes('CREATE TABLE "CollaborationConversationFilter"'), "Filtres: modèle ou migration additive absent");
for (const marker of ["lineHeights", "paragraphSpacings", "applyBlockSpacing", '"line-height"', '"margin-bottom"']) expect(richEditor.includes(marker), `Éditeur riche: espacement absent ${marker}`);
for (const code of ["COLLABORATORS", "ANNOUNCEMENTS"]) {
  const module = registry.modules.find((item) => item.code === code);
  expect(module?.maturity === "COMMERCIAL_READY", `${code}: maturité COMMERCIAL_READY absente`);
  expect(module?.commercialEvidencePath === evidencePath, `${code}: preuve commerciale absente du registre`);
}
for (const marker of ["Dr Jonathan NTUMBA", "validation commerciale", "CI/CD", "Production", "régression critique"]) expect(evidence.includes(marker), `Preuve propriétaire: marqueur absent ${marker}`);

if (failures.length) {
  console.error(`Standard collaboration commercial readiness audit failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Standard collaboration commercial readiness audit passed with versioned owner acceptance.");
