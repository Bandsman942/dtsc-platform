"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import registryData from "@/lib/modules/standard-module-registry-data.json";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import type { ContextualUserGuide as Guide } from "@/lib/user-guides/iteration04-guides";

const EXACT_INTERFACE_GUIDE_CODES = new Set([
  "SUPPORT",
  "CALENDAR",
  "DTSC_ACTIVITIES",
  "DTSC_AVAILABILITY",
  "DTSC_ABSENCES",
  "DTSC_PRESTATIONS",
]);

const DOMAIN_CAPABILITIES: Record<string, string[]> = {
  HOME: ["Lire les indicateurs réellement disponibles", "Ouvrir les actions prioritaires", "Accéder aux modules autorisés"],
  ACCOUNT: ["Consulter et mettre à jour les informations autorisées", "Vérifier le contexte actif", "Contrôler les préférences et la confidentialité"],
  SUBSCRIPTION: ["Consulter le plan actif et ses limites", "Lire les factures et paiements disponibles", "Comprendre l’impact des capacités souscrites"],
  COLLABORATION: ["Rechercher les personnes et relations autorisées", "Traiter invitations, demandes ou consentements", "Suivre les statuts et notifications associés"],
  COMMUNICATION: ["Consulter les communications pertinentes", "Ouvrir les liens profonds vers les objets concernés", "Gérer l’état lu ou traité"],
  PLANNING: ["Consulter les périodes et disponibilités", "Détecter les conflits et exceptions", "Créer ou traiter les objets de planning autorisés"],
  WORK_COORDINATION: ["Rechercher et filtrer les objets de travail", "Faire avancer les statuts autorisés", "Consulter l’historique, les commentaires et les responsabilités"],
  DOCUMENTS: ["Rechercher et consulter les documents autorisés", "Téléverser ou versionner selon les permissions", "Préserver la traçabilité et la confidentialité"],
  ANALYTICS: ["Choisir une période cohérente", "Lire la source et la fraîcheur des indicateurs", "Ouvrir les détails et exports autorisés"],
  INTELLIGENCE: ["Utiliser les fonctions d’assistance disponibles", "Vérifier les sources et limites", "Protéger les données sensibles et le contexte d’entreprise"],
  ADMINISTRATION: ["Accéder uniquement aux sections autorisées", "Appliquer les mutations selon le RBAC", "Vérifier l’audit et les impacts avant validation"],
  CONTENT: ["Créer ou consulter les contenus autorisés", "Utiliser les statuts de brouillon, publication ou archivage", "Suivre les commentaires, réactions et versions"],
  SUPPORT: ["Créer et suivre un ticket", "Ajouter des commentaires et réponses", "Consulter le statut, la priorité et les engagements de service"],
  SECURITY: ["Consulter les événements autorisés", "Appliquer les filtres et la redaction", "Tracer les actions sensibles et leurs motifs"],
};

const ACCESS_AUDIENCES: Record<string, string> = {
  PUBLIC: "Visiteurs et utilisateurs concernés",
  AUTHENTICATED: "Utilisateurs DTSC Platform authentifiés",
  GLOBAL_ROLE: "Utilisateurs disposant du rôle global requis",
  ORGANIZATION_MEMBERSHIP: "Membres actifs de l’entreprise sélectionnée",
  POSITION_PERMISSION: "Collaborateurs disposant du poste ou de la permission individuelle requise",
  ADMIN_BLOCK: "Administrateurs autorisés par le RBAC",
  EXPLICIT_DENY: "Accès indisponible tant qu’une autorisation explicite n’est pas accordée",
};

export function StandardModuleFallbackGuide() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const guide = useMemo(() => {
    const candidates = registryData.modules
      .filter((module) => module.routePath && !module.userGuidePath && !EXACT_INTERFACE_GUIDE_CODES.has(module.code))
      .sort((left, right) => String(right.routePath).length - String(left.routePath).length);
    const module = candidates.find((candidate) => routeMatches(String(candidate.routePath), pathname, searchParams));
    if (!module) return null;
    return buildFallbackGuide(module);
  }, [pathname, searchParams]);

  if (!guide) return null;

  return (
    <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 lg:bottom-6 lg:right-6" data-standard-module-fallback-guide>
      <ContextualUserGuide guide={guide} compact />
    </div>
  );
}

function routeMatches(routePath: string, pathname: string, searchParams: { get(name: string): string | null }) {
  const [routeName, queryString = ""] = routePath.split("?");
  const samePath = pathname === routeName || (routeName !== "/" && pathname.startsWith(`${routeName}/`));
  if (!samePath) return false;
  const expected = new URLSearchParams(queryString);
  for (const [key, value] of expected.entries()) {
    if (searchParams.get(key) !== value) return false;
  }
  return true;
}

function buildFallbackGuide(module: (typeof registryData.modules)[number]): Guide {
  const capabilities = DOMAIN_CAPABILITIES[module.domain] || [
    `Consulter ${module.labelFr}`,
    "Utiliser les actions réellement disponibles selon le contexte",
    "Préserver les permissions, l’historique et les données métier",
  ];
  const dependencyText = [...module.dependencies, ...module.erpDependencies].length
    ? `Dépendances fonctionnelles : ${[...module.dependencies, ...module.erpDependencies].join(", ")}.`
    : "Aucune dépendance fonctionnelle supplémentaire n’est déclarée dans le registre canonique.";

  return {
    code: `NATIVE_${module.code}`,
    title: `Guide ${module.labelFr}`,
    summary: module.descriptionFr,
    audience: ACCESS_AUDIENCES[module.accessPolicy] || "Utilisateurs autorisés",
    updatedAt: "2026-08-05",
    capabilities: [...capabilities, dependencyText],
    steps: [
      {
        title: "Vérifier le contexte et les droits",
        description: "Confirmez l’entreprise, le produit et le périmètre actifs avant de travailler.",
        actions: ["Lire le titre et la description du module", "Vérifier les filtres et le contexte actifs", "Confirmer que les actions proposées correspondent à votre responsabilité"],
      },
      {
        title: "Trouver l’information utile",
        description: "Utilisez les recherches, filtres, périodes, vues et liens profonds présents dans l’interface.",
        actions: ["Appliquer les filtres les plus précis", "Ouvrir le détail de l’objet canonique", "Contrôler son statut, son responsable et sa dernière mise à jour"],
      },
      {
        title: "Exécuter une action professionnelle",
        description: "Chaque mutation reste soumise au RBAC et aux contrôles côté serveur.",
        actions: ["Renseigner les champs obligatoires", "Ajouter un motif lorsque l’action est sensible", "Vérifier le résultat, la notification et la trace d’audit"],
        cautions: ["L’affichage d’une section ne donne pas automatiquement le droit de modifier toutes ses données."],
      },
      {
        title: "Demander de l’aide",
        description: "Créez un ticket Support lorsque le module ne permet pas de terminer une opération attendue.",
        actions: ["Décrire le contexte et le résultat attendu", "Joindre les références utiles sans exposer de secret", "Suivre les commentaires et le statut du ticket"],
      },
    ],
    limitations: [
      `Accès appliqué : ${module.accessPolicy}.`,
      module.requiresActiveSubscription ? "Une souscription active et les capacités du plan sont requises." : "Les capacités visibles restent limitées par le contexte et le RBAC.",
      "Ce guide natif de couverture complète les guides métier spécialisés et doit être remplacé par un guide plus détaillé lorsque le workflow évolue.",
    ],
  };
}
