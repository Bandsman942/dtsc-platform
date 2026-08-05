# Inventaire canonique des modules standards DTSC

## Autorité

L’inventaire machine-readable opposable est `lib/modules/standard-module-registry-data.json`. Le registre TypeScript `lib/modules/standard-module-registry.ts` fournit la normalisation des codes, aliases, statuts, maturités, routes, domaines, plans, dépendances, guides et contrats QA.

Le registre ERP existant reste l’unique autorité des modules ERP. Les entrées standard qui consomment un domaine ERP le déclarent dans `erpDependencies` et ne recréent ni table, ni statut, ni montant, ni permission ERP.

## État de l’inventaire

| Famille | Modules inventoriés | Autorité fonctionnelle |
|---|---|---|
| GLOBAL_SAAS | Dashboard, Chatbot, Abonnement, Entreprise, Relations entreprises, Calendrier, Collaborateurs, Notifications, Annonces, Web Push | Registre standard |
| ACCOUNT | Profil, Paramètres, Inscription, Connexion, Récupération | Registre standard + services d’auth/session existants |
| SUPPORT | Support | Registre standard + domaine Support existant |
| ENTERPRISE_STANDARD | Activités, tâches/opérations, demandes, validations, réunions, workflows, documents, budgets/dépenses, rapports, assistant IA, administration, collaborateurs/postes, départements, permissions, modules/abonnement, paramètres, audit | Registre standard ; dépendances ERP explicites |
| DTSC_INTERNAL | Activités DTSC, disponibilités, absences, prestations, administration, HR & CFO, COO, CEO, CTO, MPO, SCO, Legal Advisor | Registre standard + postes RH officiels |
| DTSC_CONSOLE | Vue générale, maturité, utilisateurs, entreprises clientes, abonnements, support, contenus, sécurité/audit, paramètres plateforme | Registre standard |
| PUBLIC_ECOSYSTEM | Site, services, solutions, projets, ressources, newsletter, formulaires publics, PWA, offline | Registre standard |

## Champs obligatoires

Chaque définition contient : code stable, libellés FR/EN, famille, domaine, statut technique, maturité, route, host, icône, groupe et ordre de navigation, politique d’accès, permissions, plan minimum, abonnement, dépendances standard, dépendances ERP, guide, QA, aliases et routes legacy.

## Constats initiaux

- Aucun module standard n’est promu automatiquement vers `COMMERCIAL_READY`.
- Les modules dont les parcours sont partiels restent `BETA`, `READ_ONLY_UI` ou `OPERATIONAL_UI`.
- Les modules `PROFESSIONAL_READY` sans guide exact sont signalés par l’audit des guides et devront être traités dans les itérations fonctionnelles suivantes.
- Les routes dont l’existence ne peut pas être prouvée statiquement sont signalées comme écarts à confirmer, sans être présentées comme pleinement professionnelles.
- Les surfaces standard liées aux budgets, documents, collaborateurs ou identités utilisent les dépendances ERP existantes et n’en deviennent pas une seconde source de vérité.

## Mise à jour

Toute nouvelle surface non ERP doit être ajoutée au registre avant d’être rendue visible. Toute suppression, dépréciation, migration de route, changement de plan ou promotion de maturité doit modifier le registre, les audits, la documentation et les tests correspondants dans la même PR.

## Mise à jour itération 03 — Collaboration

| Code | Route | Source canonique | Maturité technique |
|---|---|---|---|
| COLLABORATORS | `/collaborators` | CollaborationGroup et services associés | COMMERCIAL_READY |
| ANNOUNCEMENTS | `/announcements` | Announcement et commentaires associés | COMMERCIAL_READY |

Les appels, médias, commentaires, présence et modération sont des capacités du domaine ; ils ne créent pas de modules concurrents ni de registres parallèles.

## Mise à jour itération 04 — Coordination du travail

| Surface | Route principale | Source canonique | Extension de l'itération 04 |
|---|---|---|---|
| Calendrier | `/calendar` | `InternalCalendarEvent` + projections des sources | agenda unifié, période bornée, déduplication et deep links |
| Activités DTSC | `/activities` | domaines internes COO/CEO/CTO/MPO/SCO/Legal existants | guide et intégration calendrier/coordination sans migration forcée |
| Activités entreprise | `/enterprise-activities` | `EnterpriseActivityRequest` liée à `EnterpriseRequest` | chaîne de demande explicite et documentation de la coexistence |
| Tâches & opérations | `/enterprise-modules/TASKS_OPERATIONS` | `EnterpriseTask` | checklist, dépendances, blocages, filtres et deep link exact |
| Demandes internes | `/enterprise-modules/INTERNAL_REQUESTS` | `EnterpriseRequest` | information, réponse, résolution, clôture, réouverture et historique |
| Validations | `/enterprise-modules/VALIDATIONS` | `EnterpriseApproval` | versions de soumission, correction, délégation et décision idempotente |
| Réunions | `/enterprise-modules/MEETINGS` | `EnterpriseMeeting` | ordre du jour, versions de compte rendu et tâches de suivi |
| Workflows | `/enterprise-modules/WORKFLOWS` | moteur `EnterpriseWorkflow*` existant | réutilisation versionnée, projection calendrier et QA transverse |
| Documents | `/enterprise-modules/DOCUMENTS` | `EnterpriseDocument*` + `EnterpriseEntityLink` | liens multiples canoniques, aucun stockage ou lien parallèle |

Ces surfaces restent au maximum candidates à `PROFESSIONAL_READY` jusqu'aux Quality Gates, à la fusion, à la vérification Production et aux E2E manuels du propriétaire. Aucune entrée de l'itération 04 n'est promue vers `COMMERCIAL_READY` dans cette PR.
## Itération 05 — Intelligence artificielle et maturité

Le registre standard version 3 classe `GLOBAL_CHATBOT`, `ENTERPRISE_AI_ASSISTANT` et `CONSOLE_MODULE_MATURITY` comme `PROFESSIONAL_READY` après preuve automatisée. Le Chatbot et l’Assistant consomment le catalogue IA canonique ; la console de maturité couvre désormais ERP et standards. Aucune entrée n’est promue automatiquement vers `COMMERCIAL_READY`.

## Itération 07 — Console DTSC

Modules concernés : CONSOLE_OVERVIEW, CONSOLE_USERS, CONSOLE_CLIENT_ENTERPRISES, CONSOLE_SUBSCRIPTIONS, CONSOLE_SUPPORT, CONSOLE_CONTENT, CONSOLE_VISITS, CONSOLE_PLATFORM_SETTINGS, CONSOLE_SECURITY_AUDIT, CONSOLE_RBAC, DTSC_INTERNAL_ADMIN, DTSC_HR_CFO, DTSC_SCO, DTSC_COO, DTSC_CEO, DTSC_MPO, DTSC_CTO et DTSC_LEGAL. Leurs routes canoniques sont sous `/admin` et leur contrat QA est `scripts/qa-standard-dtsc-console-checks.mjs`.
