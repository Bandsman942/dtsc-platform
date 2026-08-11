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

export const AI_APPLICATION_INTERFACE_CONTEXT_VERSION = `2026-08-11.3:${STANDARD_MODULE_REGISTRY_VERSION}`;

function allowedFamilies(contextCode: AiContextCode): Set<StandardModuleFamily> {
  const common: StandardModuleFamily[] = ["GLOBAL_SAAS", "ACCOUNT", "SUPPORT", "PUBLIC_ECOSYSTEM"];
  if (contextCode === "DTSC_INTERNAL") return new Set([...common, "DTSC_INTERNAL", "DTSC_CONSOLE"]);
  if (["ORGANIZATION", "PROJECT", "MODULE", "OBJECT"].includes(contextCode)) return new Set([...common, "ENTERPRISE_STANDARD"]);
  return new Set(common);
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
  const moduleLabels = Array.from(new Set(
    STANDARD_MODULE_REGISTRY
      .filter((definition) => families.has(definition.family) && isStandardModuleNavigable(definition))
      .map((definition) => getStandardModuleLabel(definition, language))
      .filter(Boolean),
  )).join(", ");

  if (language === "en") {
    return [
      `DTSC Platform interface reference — version ${AI_APPLICATION_INTERFACE_CONTEXT_VERSION}.`,
      "Use the current product interface when guiding the user. Prefer labels visible on screen and never expose route paths, internal identifiers, enum values, database terms or implementation vocabulary unless the user explicitly asks for technical details.",
      `Current navigation areas:\n- ${groups}`,
      `Product areas currently recognized in this workspace family: ${moduleLabels}. Use these product labels as a vocabulary reference, not as proof that every area is available to the current user.`,
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
    "La connexion suit une séquence explicite : saisir les identifiants, charger les espaces disponibles, choisir l’espace de travail, puis se connecter. Aucun espace n’est sélectionné silencieusement.",
    "Sur mobile, la navigation supérieure défile horizontalement. Le sélecteur d’espace de travail est un contrôle large et lisible placé après les espaces de navigation et avant Déconnexion. Il permet de passer entre l’espace personnel et les espaces DTSC ou entreprises clientes autorisés.",
    "Les modules modernes utilisent l’en-tête DTSC unifié avec un titre clair, une courte description métier, l’actualisation et le guide utilisateur contextuel. Administration DTSC utilise désormais le même type d’en-tête que Activités DTSC.",
    "Lorsqu’une action ou un espace n’est pas visible, explique que sa disponibilité dépend de l’espace de travail actif et des droits de l’utilisateur. Ne conclus pas qu’une fonctionnalité n’existe pas simplement parce qu’elle n’est pas disponible dans le contexte courant.",
  ].join("\n\n");
}
