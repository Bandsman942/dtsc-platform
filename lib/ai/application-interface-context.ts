import type { AiContextCode } from "@/lib/ai/types";
import {
  MODULE_NAVIGATION_GROUPS,
  getModuleNavigationGroupDescription,
  getModuleNavigationGroupLabel,
  getModuleNavigationSubgroupDescription,
  getModuleNavigationSubgroupLabel,
} from "@/lib/navigation/module-navigation-groups";
import {
  STANDARD_MODULE_REGISTRY,
  STANDARD_MODULE_REGISTRY_VERSION,
  getStandardModuleLabel,
  isStandardModuleNavigable,
  type StandardModuleFamily,
} from "@/lib/modules/standard-module-registry";
import {
  ENTERPRISE_MODULE_REGISTRY,
  ENTERPRISE_MODULE_REGISTRY_VERSION,
  getEnterpriseModuleLabel,
  isEnterpriseModuleNavigable,
} from "@/lib/enterprise/module-registry";

export const AI_APPLICATION_INTERFACE_CONTEXT_VERSION = `2026-08-11.4:${STANDARD_MODULE_REGISTRY_VERSION}:${ENTERPRISE_MODULE_REGISTRY_VERSION}`;

function allowedFamilies(contextCode: AiContextCode): Set<StandardModuleFamily> {
  const common: StandardModuleFamily[] = ["GLOBAL_SAAS", "ACCOUNT", "SUPPORT", "PUBLIC_ECOSYSTEM"];
  if (contextCode === "DTSC_INTERNAL") return new Set([...common, "DTSC_INTERNAL", "DTSC_CONSOLE"]);
  if (["ORGANIZATION", "PROJECT", "MODULE", "OBJECT"].includes(contextCode)) return new Set([...common, "ENTERPRISE_STANDARD"]);
  return new Set(common);
}

function moduleDeepLink(code: string) {
  return `/modules?open=${encodeURIComponent(code)}`;
}

export function buildApplicationInterfaceContext({
  contextCode,
  locale,
}: {
  contextCode: AiContextCode;
  locale?: string | null;
}) {
  const language = locale === "en" ? "en" : "fr";
  const groups = MODULE_NAVIGATION_GROUPS
    .filter((group) => contextCode === "DTSC_INTERNAL" || group.code !== "DTSC_INTERNAL")
    .map((group) => {
      const subgroups = group.subgroups
        .map((subgroup) => `${getModuleNavigationSubgroupLabel(subgroup, language)} — ${getModuleNavigationSubgroupDescription(subgroup, language)}`)
        .join("; ");
      return `${getModuleNavigationGroupLabel(group, language)} — ${getModuleNavigationGroupDescription(group, language)}${subgroups ? ` (${subgroups})` : ""}`;
    })
    .join("\n- ");

  const families = allowedFamilies(contextCode);
  const standardModules = STANDARD_MODULE_REGISTRY
    .filter((definition) => families.has(definition.family) && isStandardModuleNavigable(definition))
    .map((definition) => ({ code: definition.code, label: getStandardModuleLabel(definition, language) }))
    .filter((item) => Boolean(item.label));
  const enterpriseModules = ["ORGANIZATION", "PROJECT", "MODULE", "OBJECT"].includes(contextCode)
    ? ENTERPRISE_MODULE_REGISTRY
        .filter(isEnterpriseModuleNavigable)
        .map((definition) => ({ code: definition.code, label: getEnterpriseModuleLabel(definition, language) }))
    : [];
  const recognizedModules = Array.from(new Map([...standardModules, ...enterpriseModules].map((item) => [item.code, item])).values());
  const moduleLabels = recognizedModules.map((item) => item.label).join(", ");
  const linkCatalog = recognizedModules
    .map((item) => `- [${item.label}](${moduleDeepLink(item.code)})`)
    .join("\n");

  if (language === "en") {
    return [
      `DTSC Platform interface reference — version ${AI_APPLICATION_INTERFACE_CONTEXT_VERSION}.`,
      "Use the current product interface when guiding the user. Prefer labels visible on screen and never expose route paths, internal identifiers, enum values, database terms or implementation vocabulary unless the user explicitly asks for technical details.",
      `Current navigation areas:\n- ${groups}`,
      `Product areas currently recognized in this workspace family: ${moduleLabels}. Use these product labels as a vocabulary reference, not as proof that every area is available to the current user.`,
      "When you explicitly mention a known module or submodule as a destination, make its visible product label a Markdown link using only the approved catalog below. Never invent a module code, route, anchor or URL. The /modules resolver checks the current workspace and permissions again before opening the destination; a link is never proof of access.",
      `Approved access-checked module links:\n${linkCatalog || "- No module link is available in this context."}`,
      "Sign-in follows an explicit sequence: enter credentials, load available workspaces, choose the workspace, then sign in. No workspace is selected silently.",
      "On mobile, the top navigation is horizontally scrollable. The workspace selector is a wide, readable control placed after the navigation areas and before Sign out. It lets the user switch between the personal workspace and authorized DTSC or client-company workspaces.",
      "Modern modules use the unified DTSC module header with a clear title, short business description, refresh action and contextual user guide. Administration DTSC now follows the same module-header experience as Activités DTSC.",
      "When an action or area is not visible, explain that availability depends on the user's current workspace and permissions. Do not claim that a feature does not exist merely because it is not available in the current context.",
    ].join("\n\n");
  }

  return [
    `Référence de l’interface DTSC Platform — version ${AI_APPLICATION_INTERFACE_CONTEXT_VERSION}.`,
    "Guide l’utilisateur à partir de l’interface produit actuelle. Utilise en priorité les libellés visibles à l’écran et n’expose jamais les chemins techniques, identifiants internes, valeurs d’énumération, termes de base de données ou vocabulaire d’implémentation sauf si l’utilisateur demande explicitement un détail technique.",
    `Espaces de navigation actuels :\n- ${groups}`,
    `Espaces produit actuellement reconnus pour cette famille de contexte : ${moduleLabels}. Utilise ces libellés comme référence de vocabulaire, sans en déduire que chaque espace est disponible pour l’utilisateur courant.`,
    "Lorsque tu cites explicitement un module ou sous-module connu comme destination, rends son libellé produit visible cliquable en Markdown en utilisant uniquement le catalogue approuvé ci-dessous. N’invente jamais de code module, chemin, ancre ou URL. Le passage par /modules revérifie l’espace actif et les droits avant d’ouvrir la destination ; un lien n’est jamais une preuve d’accès.",
    `Liens de modules approuvés et revérifiés à l’ouverture :\n${linkCatalog || "- Aucun lien de module n’est disponible dans ce contexte."}`,
    "La connexion suit une séquence explicite : saisir les identifiants, charger les espaces disponibles, choisir l’espace de travail, puis se connecter. Aucun espace n’est sélectionné silencieusement.",
    "Sur mobile, la navigation supérieure défile horizontalement. Le sélecteur d’espace de travail est un contrôle large et lisible placé après les espaces de navigation et avant Déconnexion. Il permet de passer entre l’espace personnel et les espaces DTSC ou entreprises clientes autorisés.",
    "Les modules modernes utilisent l’en-tête DTSC unifié avec un titre clair, une courte description métier, l’actualisation et le guide utilisateur contextuel. Administration DTSC utilise désormais le même type d’en-tête que Activités DTSC.",
    "Lorsqu’une action ou un espace n’est pas visible, explique que sa disponibilité dépend de l’espace de travail actif et des droits de l’utilisateur. Ne conclus pas qu’une fonctionnalité n’existe pas simplement parce qu’elle n’est pas disponible dans le contexte courant.",
  ].join("\n\n");
}
