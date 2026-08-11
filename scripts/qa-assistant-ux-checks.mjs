import fs from "node:fs";

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}`);
  return fs.readFileSync(path, "utf8");
}
function assert(condition, message) { if (!condition) throw new Error(message); }

const schema = read("prisma/assistant-conversation-preferences.prisma");
const migration = read("prisma/migrations/20260730043000_add_assistant_conversation_preferences/migration.sql");
const oauthMigration = read("prisma/migrations/20260811010000_add_mcp_user_oauth/migration.sql");
const helper = read("lib/assistant-conversation-preferences.ts");
const promptPolicy = read("lib/ai/prompts.ts");
const chatPage = read("app/chat/page.tsx");
const chatWorkspace = read("components/chat/chat-workspace-v2.tsx");
const assistantUi = read("components/chat/assistant-conversation-ui.tsx");
const immersiveShell = read("components/chat/assistant-immersive-workspace-shell.tsx");
const immersiveViewport = read("components/chat/use-immersive-conversation-viewport.ts");
const mobileChrome = read("components/layout/private-mobile-chrome-controller.tsx");
const chatRoute = read("app/api/chat/v2/route.ts");
const conversationsRoute = read("app/api/conversations/[id]/route.ts");
const enterprisePage = read("app/enterprise-modules/[moduleCode]/page.tsx");
const enterpriseWorkspace = read("components/enterprise/enterprise-ai-workspace-v2.tsx");
const enterpriseChat = read("app/api/enterprise/ai/chat/route.ts");
const enterpriseContext = read("lib/enterprise-ai/context.ts");
const enterpriseModuleRegistry = read("lib/enterprise/module-registry.ts");
const enterpriseConversations = read("app/api/enterprise/ai/conversations/[id]/route.ts");
const enterpriseMessage = read("app/api/enterprise/ai/messages/[id]/route.ts");
const connectedAppsCatalog = read("lib/ai/mcp/app-catalog.ts");
const connectedAppsPage = read("app/ai/apps/page.tsx");
const mcpTypes = read("lib/ai/mcp/types.ts");
const mcpRegistry = read("lib/ai/mcp/registry.ts");
const mcpTransport = read("lib/ai/mcp/transport.ts");
const mcpOauth = read("lib/ai/mcp/oauth.ts");
const mcpOauthCrypto = read("lib/ai/mcp/oauth-crypto.ts");
const mcpOauthStore = read("lib/ai/mcp/oauth-store.ts");
const mcpConnectRoute = read("app/api/ai/apps/oauth/connect/route.ts");
const mcpCallbackRoute = read("app/api/ai/apps/oauth/callback/route.ts");
const mcpDisconnectRoute = read("app/api/ai/apps/oauth/disconnect/route.ts");
const collaboratorComposer = read("components/chat/VoiceConversationComposer.tsx");
const collaboratorI18n = read("lib/collaboration-experience-i18n.ts");
const collaboratorAiCompose = read("app/api/collaborators/ai/compose/route.ts");
const vercel = read("vercel.json");

for (const model of ["ChatConversationPreference", "EnterpriseAiConversationPreference", "EnterpriseAiMessageFeedback"]) {
  assert(schema.includes(`model ${model}`), `Missing ${model}`);
  assert(migration.includes(`CREATE TABLE \"${model}\"`), `Missing additive migration for ${model}`);
}
assert(!/DROP TABLE|DROP COLUMN|TRUNCATE/i.test(migration), "Assistant UX migration must be non-destructive");
assert(migration.includes("EnterpriseAiMessageFeedback_value_check"), "Enterprise AI feedback must remain bounded to +/-1");

assert(helper.includes("isolation tenant") && helper.includes("confirmation humaine"), "Custom conversation instructions must never override DTSC safety rules");
assert(helper.includes("getChatConversationPreference") && helper.includes("getEnterpriseAiConversationPreference"), "Conversation preferences must be server-side sources of truth");

assert(promptPolicy.includes("Présente DTSC Platform exactement comme un utilisateur métier la voit dans l’interface"), "AI responses must use the same human-facing language as DTSC Platform");
assert(promptPolicy.includes("N’expose jamais les codes internes de modules") && promptPolicy.includes("clés camelCase"), "AI prompt policy must explicitly hide technical implementation identifiers from normal users");
assert(promptPolicy.includes("N’affiche jamais à un utilisateur métier un nom de module contenant des underscores"), "AI prompt policy must explicitly forbid underscore module names");
for (const leakedCode of ["FINANCE_ACCOUNTING", "FINANCE_CASH", "FINANCE_PAYABLES", "FINANCE_RECEIVABLES", "AI_ASSISTANT", "PHARMACY_SETTINGS"]) {
  assert(promptPolicy.includes(leakedCode), `AI user-facing contract must cover leaked identifier ${leakedCode}`);
}
assert(promptPolicy.includes("Markdown riche supporté par DTSC"), "AI presentation contract must require DTSC rich Markdown when structure helps");

assert(chatPage.includes("ChatWorkspaceV2") && chatPage.includes("listCatalogAiModelsForUi"), "Chat page must use the new assistant workspace with the canonical model catalog");
assert(assistantUi.includes("<textarea") && assistantUi.includes("requestSubmit"), "Assistant composer must be multiline and keyboard accessible");
assert(assistantUi.includes("Context and sources") && assistantUi.includes("Conversation instructions"), "Assistant settings must expose context/source and per-conversation instructions");
assert(assistantUi.includes("/ai/apps") && assistantUi.includes("Applications connectées"), "Assistant composer and settings must expose the connected applications center");
assert(chatWorkspace.includes("PINNED") && chatWorkspace.includes("ARCHIVED") && chatWorkspace.includes("Exporter en Markdown"), "Chatbot contextual menu must support pin/archive/export");
assert(chatWorkspace.includes("useCompanyContext") && chatWorkspace.includes("useKnowledge"), "Chatbot must expose real company/document context toggles");
assert(chatWorkspace.includes("/api/chat/v2") && chatRoute.includes("getChatConversationPreference"), "Chatbot v2 must apply persisted preferences server-side");
assert(chatRoute.includes("useCompanyContext") && chatRoute.includes("useKnowledge") && chatRoute.includes("modelOverride"), "Chatbot server must apply context and model overrides");
assert(chatRoute.includes("performPrivateChatActionFromHistory") && chatRoute.includes("retrieveKnowledgeContext") && chatRoute.includes("getCompanyContextForUser"), "Chatbot v2 must preserve existing private actions, RAG and company context");
assert(conversationsRoute.includes("isCatalogAiModelAllowed") && conversationsRoute.includes("chatConversationPreference.upsert"), "Chat conversation configuration must validate canonical catalog models and persist server-side");

assert(immersiveShell.includes("useImmersiveConversationViewport") && immersiveShell.includes("data-collaboration-immersive-root"), "Assistant workspaces must reuse the proven immersive viewport and chrome gesture contract");
assert(immersiveShell.includes('variant: AssistantWorkspaceVariant') && immersiveShell.includes('data-assistant-immersive-variant={variant}'), "Immersive assistant shell must distinguish chatbot and enterprise layouts");
assert(immersiveShell.includes("overscroll-behavior: contain") && immersiveShell.includes("overflow-y: auto"), "Enterprise assistant secondary tabs must scroll internally instead of scrolling the private page");
assert(immersiveViewport.includes('privateMainElement.style.position = "fixed"') && immersiveViewport.includes("visualViewport"), "Immersive assistant viewport must remain VisualViewport-aware for mobile keyboards");
assert(mobileChrome.includes("IMMERSIVE_ROOT_SELECTOR") && mobileChrome.includes("finishImmersiveGesture"), "Top and bottom navigation visibility must remain controlled by the established immersive gestures");
assert(chatPage.includes('<AssistantImmersiveWorkspaceShell variant="chatbot">'), "Chatbot page must mount the immersive workspace shell");
assert(enterprisePage.includes('<AssistantImmersiveWorkspaceShell variant="enterprise">'), "Enterprise assistant page must mount the immersive workspace shell");

assert(enterprisePage.includes("EnterpriseAiWorkspaceV2") && enterprisePage.includes("listCatalogAiModelsForUi"), "Enterprise AI module must use the new workspace with the canonical model catalog");
assert(enterpriseWorkspace.includes('import { Streamdown } from "streamdown"') && enterpriseWorkspace.includes("<Streamdown"), "Enterprise assistant messages must use the existing rich streaming Markdown renderer");
assert(enterpriseWorkspace.includes("Sources internes") && enterpriseWorkspace.includes("Outils métier"), "Enterprise assistant must expose only real internal sources and read tools");
assert(enterpriseWorkspace.includes("asCitations") && enterpriseWorkspace.includes("feedbackValue") && enterpriseWorkspace.includes("ThumbsUp") && enterpriseWorkspace.includes("ThumbsDown"), "Enterprise assistant must render citations and persistent feedback controls");
assert(enterpriseWorkspace.includes("PINNED") && enterpriseWorkspace.includes("ARCHIVED") && enterpriseWorkspace.includes("Exporter en Markdown"), "Enterprise conversation menu must include pin/archive/export");
assert(enterpriseChat.includes("getEnterpriseAiConversationPreference") && enterpriseChat.includes("preference?.useKnowledge") && enterpriseChat.includes("preference?.useTools") && enterpriseChat.includes("preference?.modelOverride"), "Enterprise chat must apply persisted conversation preferences server-side");
assert(enterpriseChat.includes("buildEnterpriseAiInstructions") && enterpriseChat.includes("retrieveEnterpriseAiKnowledge") && enterpriseChat.includes("runPharmacyReadTools"), "Enterprise assistant must preserve sector context, RAG and existing read tools");
assert(enterpriseContext.includes("listEnterpriseModuleDefinitions") && enterpriseModuleRegistry.includes("labelFr") && enterpriseModuleRegistry.includes("labelEn"), "Enterprise assistant module vocabulary must come from the canonical UX module registry");
assert(enterpriseContext.includes("VOCABULAIRE CANONIQUE DES MODULES") && enterpriseContext.includes("labelFr") && enterpriseContext.includes("labelEn"), "Enterprise assistant prompt must receive bilingual canonical module labels");
assert(enterpriseContext.includes("N'affiche jamais un nom de module avec des underscores") && enterpriseContext.includes("FINANCE_ACCOUNTING") && enterpriseContext.includes("FINANCE_CASH") && enterpriseContext.includes("FINANCE_PAYABLES") && enterpriseContext.includes("FINANCE_RECEIVABLES"), "Enterprise assistant must explicitly guard the real accounting underscore regression");
assert(enterpriseContext.includes("FORMAT DE RÉPONSE ENRICHI") && enterpriseContext.includes("Markdown riche") && enterpriseContext.includes("tableaux"), "Enterprise assistant must request the existing enriched message format");
assert(enterpriseConversations.includes("enterpriseAiConversationPreference.upsert") && enterpriseConversations.includes("isCatalogAiModelAllowed"), "Enterprise conversation configuration must validate canonical catalog models and persist preferences");
assert(enterpriseMessage.includes("enterpriseAiMessageFeedback.upsert") && enterpriseMessage.includes('message.role !== "assistant"'), "Enterprise feedback must persist only for assistant responses");
assert(!chatWorkspace.includes("useWeb") && !enterpriseWorkspace.includes("useWeb") && !enterpriseChat.includes("useWeb"), "Do not advertise a web-search source that DTSC does not implement");

for (const appName of ["Gmail", "Google Calendar", "Notion", "GitHub", "Linear", "Jira & Confluence", "Stripe"]) {
  assert(connectedAppsCatalog.includes(`name: \"${appName}\"`), `Connected applications catalog must include ${appName}`);
}
assert(connectedAppsCatalog.includes("MCP_SERVER_REGISTRY") && connectedAppsCatalog.includes("READY_TO_CONNECT") && connectedAppsCatalog.includes("CONNECTED"), "Connected applications must derive real certification and per-user OAuth status");
assert(connectedAppsPage.includes("/api/ai/apps/oauth/connect") && connectedAppsPage.includes("/api/ai/apps/oauth/disconnect"), "Connected applications UI must expose real connect and disconnect actions only for eligible servers");
assert(connectedAppsPage.includes("Seuls les serveurs MCP certifiés par DTSC") && connectedAppsPage.includes("ne les expose jamais au modèle IA"), "Connected applications UI must explain the security boundary in human language");

assert(mcpTypes.includes('"OAUTH_USER"'), "MCP server contract must support user OAuth without changing legacy auth modes");
assert(mcpRegistry.includes("oauthAllowedHosts") && mcpRegistry.includes("OAUTH_USER requires oauthClientIdEnvKey"), "OAuth servers must declare explicit client configuration and certified metadata hosts");
assert(mcpOauthCrypto.includes("aes-256-gcm") && mcpOauthCrypto.includes("setAAD") && mcpOauthCrypto.includes("DTSC_MCP_OAUTH_ENCRYPTION_KEY"), "MCP OAuth credentials must be encrypted server-side with authenticated tenant-bound encryption");
assert(mcpOauth.includes("code_challenge_method") && mcpOauth.includes('"S256"') && mcpOauth.includes('url.searchParams.set("resource"'), "MCP OAuth must use PKCE S256 and resource indicators");
assert(mcpOauth.includes("oauth-protected-resource") && mcpOauth.includes("oauth-authorization-server") && mcpOauth.includes("openid-configuration"), "MCP OAuth must support protected-resource and authorization-server discovery");
assert(mcpOauthStore.includes("encryptedCredentials") && mcpOauthStore.includes("consumeMcpOAuthState") && !mcpOauthStore.includes("console.log"), "OAuth tokens and PKCE verifier must remain in the encrypted server store");
assert(oauthMigration.includes('CREATE TABLE "McpUserOAuthConnection"') && oauthMigration.includes('CREATE TABLE "McpUserOAuthState"'), "MCP OAuth persistence migration must create connection and one-time-state tables");
assert(!/DROP TABLE|DROP COLUMN|TRUNCATE/i.test(oauthMigration), "MCP OAuth migration must be additive");
assert(oauthMigration.includes('"userId", "organizationId", "serverCode"') && oauthMigration.includes("ON DELETE CASCADE"), "MCP OAuth credentials must be isolated by user, organization and server");
assert(mcpConnectRoute.includes("isSameOriginRequest") && mcpConnectRoute.includes("requireActiveOrganizationMembership") && mcpConnectRoute.includes("rateLimit"), "OAuth connect must enforce same-origin, active tenant membership and rate limiting");
assert(mcpCallbackRoute.includes("consumeMcpOAuthState") && mcpCallbackRoute.includes("activeOrganizationId !== savedState.organizationId"), "OAuth callback must consume state once and reject tenant-context changes");
assert(mcpDisconnectRoute.includes("revokeMcpOAuthConnection") && mcpDisconnectRoute.includes("localCredentialsDestroyed: true"), "OAuth disconnect must destroy the local encrypted credential even when remote revocation is unavailable");
assert(mcpTransport.includes("getValidMcpOAuthAccessToken") && mcpTransport.includes("MCP_OAUTH_USER_CONTEXT_REQUIRED"), "MCP transport must resolve user tokens server-side only with explicit user and tenant context");

assert(collaboratorComposer.includes('aiT("aiCopilot")') && collaboratorComposer.includes("PROPOSE_REPLY") && collaboratorI18n.includes('aiCopilot: "Copilote IA DTSC"'), "Mes collaborateurs composer must expose the DTSC AI drafting copilot through the shared i18n contract");
assert(collaboratorComposer.includes('aiT("aiPrivacyNote")') && collaboratorI18n.includes("vous décidez toujours de l’envoi") && collaboratorI18n.includes("n’envoie aucun message à votre place"), "Collaboration AI drafting must keep explicit user control over sending in the FR/EN i18n source of truth");
assert(collaboratorAiCompose.includes("routeAiStream") && collaboratorAiCompose.includes("prepareAiTurn"), "Collaboration AI drafting must use the canonical DTSC AI runtime");
assert(collaboratorAiCompose.includes("isSameOriginRequest") && collaboratorAiCompose.includes("rateLimit") && collaboratorAiCompose.includes("getSession"), "Collaboration AI drafting must keep same-origin, session and rate-limit protections");
assert(collaboratorAiCompose.includes("Retourne uniquement le texte final") && collaboratorAiCompose.includes("L’envoi reste une action distincte"), "Collaboration AI drafting must return a draft without pretending to send it");

assert(vercel.includes('"main": true') && vercel.includes('"*": false') && vercel.includes("ignoreCommand"), "Vercel must remain production-only from main");
console.log("Assistant UI/UX, canonical module labels, rich enterprise formatting, encrypted tenant-safe MCP OAuth, collaboration copilot, tenant-safe sources and production-only CI/CD QA passed.");
