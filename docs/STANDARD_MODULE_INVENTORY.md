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
