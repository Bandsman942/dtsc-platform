import fs from "node:fs";
import process from "node:process";

const read = (path) => fs.readFileSync(path, "utf8");
const resolver = read("components/chat/assistant-markdown.tsx");
const conversationUi = read("components/chat/assistant-conversation-ui.tsx");
const chatbot = read("components/chat/chat-workspace-v2.tsx");
const enterpriseAssistant = read("components/enterprise/enterprise-ai-workspace-v2.tsx");
const moduleHub = read("app/modules/page.tsx");

const failures = [];
function need(condition, message) {
  if (!condition) failures.push(message);
}

need(resolver.includes("/modules\\?open=[A-Za-z0-9_]+"), "Le résolveur doit être borné au deeplink canonique /modules?open=MODULE_CODE.");
need(resolver.includes("origin}${modulePath}"), "Le résolveur doit convertir le deeplink relatif vers l’origine courante.");
need(!resolver.includes("javascript:") && !resolver.includes("data:"), "Le résolveur ne doit jamais autoriser explicitement des schémas dangereux.");
need(conversationUi.includes("window.location.origin"), "AssistantMessage doit résoudre l’origine réelle du navigateur après hydratation.");
need(conversationUi.includes("resolveAssistantModuleDeeplinks"), "AssistantMessage doit appliquer le résolveur partagé aux réponses assistant.");
need(conversationUi.includes("role === \"assistant\""), "La réécriture des deeplinks doit rester limitée aux réponses de l’assistant.");
need(conversationUi.includes("cloneElement"), "La réponse Streamdown existante doit être conservée et recevoir uniquement le contenu deeplink résolu.");
need(conversationUi.includes("ASSISTANT_LINK_STYLES"), "Les liens IA doivent utiliser le style partagé accessible.");
need(resolver.includes("text-cyan-600") && resolver.includes("underline") && resolver.includes("focus-visible"), "Les liens doivent être cyan, soulignés et disposer d’un focus visible.");

need(chatbot.includes("AssistantMessage") && chatbot.includes("<Streamdown>"), "Le Chatbot V2 doit continuer à rendre les réponses via AssistantMessage + Streamdown.");
need(enterpriseAssistant.includes("AssistantMessage") && enterpriseAssistant.includes("<Streamdown>"), "L’Assistant IA Entreprise V2 doit continuer à rendre les réponses via AssistantMessage + Streamdown.");

need(moduleHub.includes("getEnterpriseNavigationModules(organizationId, user.id, user.locale)"), "Le hub modules doit continuer à calculer les modules entreprise selon organisation + utilisateur.");
need(moduleHub.includes("standardCodeAllowed"), "Le hub modules doit conserver le filtrage des modules standards selon le contexte.");
need(moduleHub.includes("if (enterpriseDestination) redirect(enterpriseDestination.href)"), "Un deeplink entreprise ne doit rediriger que vers une destination déjà autorisée.");
need(moduleHub.includes("requestedModuleDenied = true"), "Un module non autorisé doit rester refusé côté serveur.");

const fixture = [
  "[Vue d’ensemble financière](/modules?open=FINANCE_BUDGETS)",
  "[Caisse](/modules?open=FINANCE_CASH)",
  "[Trésorerie](/modules?open=FINANCE_TREASURY)",
  "[Agence Mobile Money](/modules?open=MOBILE_MONEY_AGENCY)",
  "[Clôture magasin](/modules?open=RETAIL_DAILY_CLOSE)",
  "[Point de vente](/modules?open=RETAIL_POS)",
  "[Télécom & forfaits](/modules?open=TELCO_TOPUPS)",
  "[Support](/modules?open=SUPPORT)",
  "[Externe](https://example.com/help)",
  "[Dangereux](javascript:alert(1))",
].join("\n");
const expectedOrigin = "https://app.dtsc-platform.com";
const resolvedFixture = fixture.replace(/\]\((\/modules\?open=[A-Za-z0-9_]+)\)/g, (_match, modulePath) => `](${expectedOrigin}${modulePath})`);

for (const code of ["FINANCE_BUDGETS", "FINANCE_CASH", "FINANCE_TREASURY", "MOBILE_MONEY_AGENCY", "RETAIL_DAILY_CLOSE", "RETAIL_POS", "TELCO_TOPUPS", "SUPPORT"]) {
  need(resolvedFixture.includes(`${expectedOrigin}/modules?open=${code}`), `Le fixture OWNER doit produire un deeplink absolu pour ${code}.`);
}
need(resolvedFixture.includes("[Externe](https://example.com/help)"), "Un lien externe existant ne doit pas être réécrit par le hotfix.");
need(resolvedFixture.includes("[Dangereux](javascript:alert(1))"), "Le hotfix ne doit pas transformer un schéma dangereux en lien de confiance.");

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log("PASS #337 — deeplinks modules IA bornés, persona-aware via /modules et style accessible vérifiés.");
