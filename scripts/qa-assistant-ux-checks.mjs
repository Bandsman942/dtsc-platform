import fs from "node:fs";

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}`);
  return fs.readFileSync(path, "utf8");
}
function assert(condition, message) { if (!condition) throw new Error(message); }

const schema = read("prisma/assistant-conversation-preferences.prisma");
const migration = read("prisma/migrations/20260730043000_add_assistant_conversation_preferences/migration.sql");
const helper = read("lib/assistant-conversation-preferences.ts");
const chatPage = read("app/chat/page.tsx");
const chatWorkspace = read("components/chat/chat-workspace-v2.tsx");
const assistantUi = read("components/chat/assistant-conversation-ui.tsx");
const chatRoute = read("app/api/chat/v2/route.ts");
const conversationsRoute = read("app/api/conversations/[id]/route.ts");
const enterprisePage = read("app/enterprise-modules/[moduleCode]/page.tsx");
const enterpriseWorkspace = read("components/enterprise/enterprise-ai-workspace-v2.tsx");
const enterpriseChat = read("app/api/enterprise/ai/chat/route.ts");
const enterpriseConversations = read("app/api/enterprise/ai/conversations/[id]/route.ts");
const enterpriseMessage = read("app/api/enterprise/ai/messages/[id]/route.ts");
const vercel = read("vercel.json");

for (const model of ["ChatConversationPreference", "EnterpriseAiConversationPreference", "EnterpriseAiMessageFeedback"]) {
  assert(schema.includes(`model ${model}`), `Missing ${model}`);
  assert(migration.includes(`CREATE TABLE \"${model}\"`), `Missing additive migration for ${model}`);
}
assert(!/DROP TABLE|DROP COLUMN|TRUNCATE/i.test(migration), "Assistant UX migration must be non-destructive");
assert(migration.includes("EnterpriseAiMessageFeedback_value_check"), "Enterprise AI feedback must remain bounded to +/-1");

assert(helper.includes("isolation tenant") && helper.includes("confirmation humaine"), "Custom conversation instructions must never override DTSC safety rules");
assert(helper.includes("getChatConversationPreference") && helper.includes("getEnterpriseAiConversationPreference"), "Conversation preferences must be server-side sources of truth");

assert(chatPage.includes("ChatWorkspaceV2") && chatPage.includes("getConfiguredOpenAIModels"), "Chat page must use the new assistant workspace with configured models");
assert(assistantUi.includes("<textarea") && assistantUi.includes("requestSubmit"), "Assistant composer must be multiline and keyboard accessible");
assert(assistantUi.includes("Context and sources") && assistantUi.includes("Conversation instructions"), "Assistant settings must expose context/source and per-conversation instructions");
assert(chatWorkspace.includes("PINNED") && chatWorkspace.includes("ARCHIVED") && chatWorkspace.includes("Exporter en Markdown"), "Chatbot contextual menu must support pin/archive/export");
assert(chatWorkspace.includes("useCompanyContext") && chatWorkspace.includes("useKnowledge"), "Chatbot must expose real company/document context toggles");
assert(chatWorkspace.includes("/api/chat/v2") && chatRoute.includes("getChatConversationPreference"), "Chatbot v2 must apply persisted preferences server-side");
assert(chatRoute.includes("useCompanyContext") && chatRoute.includes("useKnowledge") && chatRoute.includes("modelOverride"), "Chatbot server must apply context and model overrides");
assert(chatRoute.includes("performPrivateChatActionFromHistory") && chatRoute.includes("retrieveKnowledgeContext") && chatRoute.includes("getCompanyContextForUser"), "Chatbot v2 must preserve existing private actions, RAG and company context");
assert(conversationsRoute.includes("isConfiguredOpenAIModel") && conversationsRoute.includes("chatConversationPreference.upsert"), "Chat conversation configuration must validate models and persist server-side");

assert(enterprisePage.includes("EnterpriseAiWorkspaceV2") && enterprisePage.includes("getConfiguredOpenAIModels"), "Enterprise AI module must use the new workspace with configured models");
assert(enterpriseWorkspace.includes("Sources internes") && enterpriseWorkspace.includes("Outils métier"), "Enterprise assistant must expose only real internal sources and read tools");
assert(enterpriseWorkspace.includes("asCitations") && enterpriseWorkspace.includes("feedbackValue") && enterpriseWorkspace.includes("ThumbsUp") && enterpriseWorkspace.includes("ThumbsDown"), "Enterprise assistant must render citations and persistent feedback controls");
assert(enterpriseWorkspace.includes("PINNED") && enterpriseWorkspace.includes("ARCHIVED") && enterpriseWorkspace.includes("Exporter en Markdown"), "Enterprise conversation menu must include pin/archive/export");
assert(enterpriseChat.includes("getEnterpriseAiConversationPreference") && enterpriseChat.includes("preference?.useKnowledge") && enterpriseChat.includes("preference?.useTools") && enterpriseChat.includes("preference?.modelOverride"), "Enterprise chat must apply persisted conversation preferences server-side");
assert(enterpriseChat.includes("buildEnterpriseAiInstructions") && enterpriseChat.includes("retrieveEnterpriseAiKnowledge") && enterpriseChat.includes("runPharmacyReadTools"), "Enterprise assistant must preserve sector context, RAG and existing read tools");
assert(enterpriseConversations.includes("enterpriseAiConversationPreference.upsert") && enterpriseConversations.includes("isConfiguredOpenAIModel"), "Enterprise conversation configuration must validate and persist preferences");
assert(enterpriseMessage.includes("enterpriseAiMessageFeedback.upsert") && enterpriseMessage.includes('message.role !== "assistant"'), "Enterprise feedback must persist only for assistant responses");
assert(!chatWorkspace.includes("useWeb") && !enterpriseWorkspace.includes("useWeb") && !enterpriseChat.includes("useWeb"), "Do not advertise a web-search source that DTSC does not implement");

assert(vercel.includes('"main": true') && vercel.includes('"*": false') && vercel.includes("ignoreCommand"), "Vercel must remain production-only from main");
console.log("Assistant UI/UX, conversation preferences, tenant-safe sources and production-only CI/CD QA passed.");
