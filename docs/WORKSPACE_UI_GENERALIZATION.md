# Généralisation UI/UX Workspace DTSC

## Objectif

Cette phase généralise l'architecture validée lors du Sprint 2 après le pilote `Activités DTSC`, sans démarrer le Sprint 3 fonctionnel.

La hiérarchie de référence reste :

`Page → Header métier → contrôles → KPI compacts → contenu métier → actions contextuelles`.

Les migrations ne modifient pas les modèles Prisma, les règles de domaine, les endpoints ni les permissions serveur sauf correction explicitement indispensable et documentée.

## Ordre de généralisation

1. COO / opérations
2. CEO / supervision
3. HR & CFO
4. MPO / projets
5. CTO / technique
6. SCO / supply chain
7. Legal Advisor
8. Finance
9. Administration Entreprise
10. Health
11. Pharmacy

## Décision architecturale : espaces DTSC internes

COO, HR & CFO, MPO, CTO, SCO et Legal utilisent déjà le même moteur `OperationsAdminPanel`. CEO réutilise aussi ce panneau sous sa synthèse exécutive.

La généralisation est donc réalisée dans le composant partagé plutôt que par duplication de sept interfaces.

Le nouveau panneau utilise :

- `ModuleWorkspace` ;
- `ModuleHeader` ;
- `ModuleMetrics` ;
- `ModuleToolbar` ;
- `ModuleSection` ;
- `ListControls + useSmartList` ;
- `BusinessList / BusinessListItem` ;
- `ContextActions` ;
- `StatusBadge` ;
- `EmptyState`.

Les actions CRUD conservent les endpoints contenus dans les `OperationDataset` existants. L'affichage d'une action reste conditionné par les droits UI existants, sans remplacer les contrôles serveur.

## CEO

La synthèse exécutive abandonne les grandes cards imbriquées. La période reste transmise par GET à `/admin?section=ceo`, les groupes deviennent des `ModuleSection` et leurs indicateurs des `ModuleMetric` compacts.

## Legal Advisor

La synthèse juridique utilise le même header et les mêmes métriques. Les graphiques de volume deviennent des sections plates avec séparateurs et barres légères.

Le panneau opérationnel juridique continue de passer par `OperationsAdminPanel`.

## Finance

Le vrai module commun est `FINANCE_BUDGETS` avec les types `BUDGET` et `EXPENSE`.

La migration repose sur `EnterpriseModuleWorkspace` et `EnterpriseCoreWorkspace` :

- header commun ;
- KPI compacts ;
- objets ERP en lignes ;
- menus contextuels déclaratifs ;
- états vides différenciés ;
- conservation de `ListControls + useSmartList`.

L'isolation `organizationId` et la visibilité créée/demandée/assignée/validée pour les non-managers restent serveur.

## Administration Entreprise

L'ancien résumé composé de plusieurs panneaux et grandes cartes KPI est remplacé par :

- un `ModuleHeader` ;
- un bloc contexte léger ;
- un `ModuleMetrics` ;
- un `ModuleContent`.

Les accordéons sont conservés uniquement pour les groupes administratifs longs où le repli a une valeur sémantique : modules, calendrier, collaborateurs/postes, départements, workflows et branding.

Health et Pharmacy ne sont plus encapsulés dans cet accordion général.

## Health

Health est un domaine particulièrement volumineux avec des sous-modules spécialisés et des règles cliniques sensibles.

Cette phase ne réécrit pas le composant métier complet. Elle introduit `SectorWorkspaceFrame` pour :

- supprimer le conteneur décoratif racine ;
- transformer la navigation directe des sous-modules en rail compact ;
- conserver les formulaires, transitions, API et permissions Health existants ;
- préparer une migration interne progressive des sous-modules sans big-bang.

`SectorWorkspaceFrame` est un pont de migration pour les grands écrans legacy. Il ne doit pas devenir un substitut à `components/workspace/*` pour du nouveau code.

## Pharmacy

Le shell `PharmacyAdminWorkspace` migre directement vers les primitives workspace :

- `ModuleHeader` ;
- navigation horizontale compacte des sous-modules ;
- `ModuleContent` ;
- dashboard en `ModuleMetrics` ;
- listes génériques en `BusinessList` ;
- `ContextActions` pour les actions réelles.

Les workspaces spécialisés Produits, Lots, Stock, Réceptions, Ventes, Prescriptions, Achats, Caisse, Ajustements, Alertes, Qualité, Documents, Rapports et Paramètres restent responsables de leur logique métier.

## Mobile

Les règles Sprint 1 restent bloquantes :

- `min-w-0` ;
- aucun scroll horizontal de page ;
- rails horizontaux uniquement locaux et bornés ;
- safe areas ;
- champs iOS ;
- `visualViewport` ;
- dialogues scrollables ;
- menus et dropdowns tactiles ;
- aucun changement du cache PWA privé.

## Permissions

La migration UI ne crée aucune permission.

- DTSC interne : `isDtscInternalSession`, `canAccessAdminSection`, poste et rôle restent autoritaires côté serveur.
- Entreprises clientes : `requireEnterpriseMembership`, `canAccessEnterpriseModule`, `organizationId`, permissions de poste et permissions sectorielles restent autoritaires.
- Health/Pharmacy : aucune permission sectorielle n'est déplacée vers le client.

## Règle de réutilisation

Lorsqu'un ensemble de rôles ou modules partage déjà un moteur de présentation et de mutations, généraliser le composant partagé avant de créer des variantes par rôle.

Une variante métier n'est justifiée que par des différences de données, de workflow ou de permissions réelles.
