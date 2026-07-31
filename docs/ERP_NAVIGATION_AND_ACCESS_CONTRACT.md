# Contrat de navigation et d’accès ERP

## Résolution obligatoire

Toute ouverture de module entreprise suit la chaîne suivante :

```text
session
→ activeContext ORGANIZATION
→ activeOrganizationId
→ OrganizationMember ACTIVE et non retiré
→ Organization CLIENT ACTIVE et non supprimée
→ code canonique connu
→ statut ACTIVE ou BETA
→ secteur compatible
→ EnterpriseModule tenant présent et activé
→ dépendances actives
→ entitlement du plan et abonnement
→ rôle et permissions du poste
→ action demandée
→ filtrage de l’objet par organizationId
```

Un rôle DTSC global ne remplace jamais le membership actif d’une entreprise cliente.

## Fonctions centrales

- `getEnterpriseModuleDefinition(moduleCode)` : définition canonique et résolution des aliases.
- `isEnterpriseModuleImplemented(moduleCode)` : statut fonctionnel.
- `resolveEnterpriseModuleRoute(moduleCode)` : route ou redirection allow-listée.
- `resolveEnterpriseModuleAccess(...)` : décision serveur pour une action.
- `listNavigableEnterpriseModules(...)` : navigation issue des décisions autorisées.
- `listEnterpriseModuleConfigurationIssues(organizationId)` : incohérences compréhensibles dans l’administration.

## Actions et rôles

- `OWNER` et administrateur entreprise : gestion selon les fonctions autorisées.
- `MANAGER` : lecture, soumission et écriture métier autorisée; jamais `manage` automatique.
- `MEMBER` : lecture et soumission selon les permissions.
- `GUEST` : lecture limitée.
- Les permissions du poste prévalent lorsqu’elles existent.
- Le frontend ne remplace jamais les contrôles API et service.

## Modules inconnus ou non implémentés

| Situation | Navigation | Route | Template | Diagnostic |
|---|---|---|---|---|
| Code inconnu | Masqué | 404/refus | Désactivé | Erreur si code actif |
| `PLANNED` | Masqué | Refus | Désactivé | Information/audit |
| `HIDDEN` | Masqué | Refus | Désactivé | Information/audit |
| Secteur incompatible | Masqué | Refus | Désactivé | Erreur de configuration |
| Dépendance inactive | Masqué | Refus | Ligne conservée | Erreur de configuration |
| Plan insuffisant | Masqué | Refus entitlement | Ligne conservée | Message d’abonnement |
| Permission insuffisante | Masqué | 404/refus | Sans effet | Audit d’accès approprié |

## Navigation desktop

- Les modules sont groupés par domaine.
- Les groupes sans module autorisé sont absents.
- Les groupes détaillés sont repliables.
- L’entrée Administration est unique.
- Les icônes sont résolues par `enterprise-module-icons.ts` depuis une clé du registre.

## Navigation mobile

- La barre principale ne contient pas tous les modules ERP.
- L’entrée `Modules ERP` ouvre `/enterprise-modules`.
- Le hub affiche les groupes et modules autorisés sous forme de listes métier responsives.
- Les rails KPI existants restent horizontaux et internes au module.
- Aucun groupe ne doit provoquer un débordement global horizontal.

## Routage

### URL stable

```text
/enterprise-modules/{moduleCode}
```

La route résout d’abord le code canonique. Les aliases connus redirigent vers l’URL canonique.

### Workspaces Core

Les workspaces Core sont sélectionnés explicitement par le code applicatif. Aucun CRUD générique ne remplace un workspace dédié.

### Workspaces Health et Pharmacy

Les renderers sont une allow-list TypeScript statique. Aucune valeur de base ne construit un chemin d’import ou un accès `prisma[moduleCode]`.

### Administration historique

Les anciens codes administratifs redirigent vers une section précise de `/enterprise-admin`. La redirection est exécutée uniquement après une décision d’accès `manage` autorisée.

## Deep links

Les notifications, activités, workflows, rapports et cartes d’administration doivent produire :

- l’URL canonique du module ;
- puis, lorsque l’objet possède déjà une route de détail sûre, l’identifiant ou le paramètre permettant de cibler l’objet précis.

Cette itération garantit la résolution du bon module. La généralisation des routes de détail objet par objet reste régie par les contrats de chaque domaine.

## Templates sectoriels

L’application d’un template passe par `applyCanonicalSectorTemplateToOrganization` :

1. application additive/merge du template historique ;
2. résolution de chaque module par le registre ;
3. désactivation non destructive des codes non implémentés, incompatibles, administratifs, cachés ou aliases dupliqués ;
4. désactivation des blocs d’activité ciblant ces codes ;
5. conservation des lignes et données pour audit.

## Observabilité

Les incohérences sont :

- détectées par `audit:enterprise-modules` ;
- contrôlées statiquement par `qa:enterprise-module-registry` ;
- visibles dans Administration entreprise pour un responsable autorisé ;
- journalisées uniquement lors d’un événement d’accès ou de configuration pertinent, pas à chaque rendu normal.

## Rollback

Le rollback applicatif peut rétablir l’ancien résolveur de navigation sans perte de données, car :

- aucune table ni colonne n’est supprimée ;
- aucune migration historique n’est modifiée ;
- les aliases et lignes tenant sont conservés ;
- la désactivation des modules fantômes est réversible par configuration, mais ne doit être faite qu’après décision explicite.

Aucun feature flag ne doit réduire les contrôles de sécurité.
