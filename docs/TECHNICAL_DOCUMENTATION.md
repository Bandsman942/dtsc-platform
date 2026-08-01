# DTSC Platform — Documentation technique

**Version :** ERP Consolidation 5/5 — Release A
**Repository :** `Bandsman942/dtsc-platform`
**Production :** déploiement Vercel exclusivement depuis `main`

## 1. Objet

Ce document est le point d’entrée technique de DTSC Platform. Les règles exécutables sont dans `AGENTS.md`; les contrats détaillés se trouvent dans les documents spécialisés du dossier `docs/`.

La plateforme réunit :

- un site public ;
- un espace compte/authentification ;
- une application SaaS multi-entreprises ;
- une console interne DTSC ;
- un support client ;
- des modules collaboratifs ;
- un ERP commun ;
- des extensions sectorielles Health et Pharmacy ;
- une couche IA ;
- une PWA et des notifications temps réel/Web Push.

## 2. Stack principale

| Couche | Technologie |
|---|---|
| Framework | Next.js App Router 15 |
| Interface | React 19, TypeScript, Tailwind CSS |
| Validation | Zod |
| ORM | Prisma 6 multi-schema |
| Base | PostgreSQL |
| Hébergement | Vercel |
| Authentification | session serveur et cookie HTTP-only signé |
| Temps réel | infrastructure temps réel existante selon module |
| Appels | LiveKit côté infrastructure, sans marque technique dans l’UI |
| IA | AI SDK et fournisseurs configurés côté serveur |
| Stockage | stockage privé via routes serveur contrôlées |
| QA | scripts Node dédiés + type-check + lint + build |

## 3. Architecture produits et sous-domaines

Les helpers de domaine centralisent les destinations ; aucune navigation inter-produit critique ne doit hardcoder les URLs.

```text
dtsc-platform.com          site public
account.dtsc-platform.com  compte et authentification
app.dtsc-platform.com      application SaaS
console.dtsc-platform.com  console interne DTSC
support.dtsc-platform.com  support client
```

Le middleware protège les produits, exclut les assets et `/api/*` des réécritures, conserve le fallback offline public et empêche l’exposition de la console dans l’application cliente.

La redirection post-login n’accepte que des destinations internes fiables afin d’éviter les open redirects.

## 4. Authentification et contexte actif

La session identifie au minimum :

- l’utilisateur ;
- le rôle global ;
- le contexte actif ;
- l’organisation active lorsqu’elle existe.

Contextes principaux :

- `DTSC_INTERNAL` : tenant interne et console DTSC ;
- `ORGANIZATION` : organisation cliente active ;
- `GLOBAL_CLIENT` : contexte client global ;
- contextes communautaires éventuels pour les surfaces partagées.

Un cookie partagé entre sous-domaines peut être activé par configuration serveur. La déconnexion expire le cookie host-only et le cookie partagé lorsqu’il existe.

## 5. Multi-tenant

L’isolation repose sur :

```text
userId
+ activeOrganizationId
+ membership actif
+ contexte de session
+ permissions du module
+ visibilité de l’objet
```

Chaque requête métier vérifie `organizationId` côté serveur. Une URL, un body ou une foreign key fournie par le client ne constitue jamais une preuve d’accès.

Les rôles globaux ne donnent aucun accès implicite aux données privées d’une organisation cliente. Un `MANAGER` n’est pas automatiquement administrateur entreprise.

Le tenant interne stable est `dtsc-internal`; ses données et workflows restent séparés des modules RH/Finance propres aux clients.

## 6. Registre canonique des modules

L’autorité est constituée de :

- `lib/enterprise/module-registry-data.json` ;
- extensions de registre par itération/domaine ;
- `lib/enterprise/module-registry.ts` ;
- workspaces allow-listés dans le code.

Le registre définit : code, statut, domaine, navigation, route, workspace, permissions, secteur, plan, dépendances, aliases et QA.

Statuts : `ACTIVE`, `BETA`, `PLANNED`, `DEPRECATED`, `HIDDEN`, `RETIRED`.

`EnterpriseModule` configure l’activation tenant mais ne peut jamais ouvrir un code absent, non compatible, non entitled ou masqué dans le registre.

Références :

- `docs/ERP_MODULE_INVENTORY.md`
- `docs/ERP_NAVIGATION_AND_ACCESS_CONTRACT.md`
- `docs/ERP_FINAL_PERMISSION_MATRIX.md`

## 7. Architecture ERP finale

### Core commun

- tiers et rôles ;
- catalogue produits/services ;
- sites, entrepôts et emplacements ;
- CRM ;
- devis, contrats, commandes et livraisons ;
- fournisseurs, achats et réceptions ;
- stock commun et valorisation ;
- RH/paie client ;
- projets, timesheets, actifs et maintenance ;
- documents ;
- Workflow Engine v2 ;
- rapports et assistant IA.

### Finance commune

- configuration financière ;
- plan comptable ;
- exercices et périodes ;
- journaux et lignes ;
- factures clients/fournisseurs ;
- créances et dettes ;
- paiements et allocations ;
- caisse et banque ;
- trésorerie ;
- rapprochements ;
- taxes ;
- clôture ;
- états financiers.

Référence : `docs/ERP_FINAL_ARCHITECTURE.md`.

## 8. Propriété des données

Une seule source de vérité est autorisée par domaine.

- `EnterpriseBusinessParty` : tiers communs ;
- `EnterpriseCatalogItem` : catalogue commun ;
- modèles CRM/ventes/achats/stock/RH/projets/actifs dédiés : opérations Core ;
- `EnterpriseSalesInvoice`, `EnterpriseSupplierInvoice` : factures ;
- `EnterpriseReceivable`, `EnterprisePayable` : soldes ouverts ;
- `EnterprisePayment`, `EnterprisePaymentAllocation` : paiements ;
- `EnterpriseCashSession`, comptes et mouvements de trésorerie : liquidités ;
- `EnterpriseJournalEntry`, `EnterpriseJournalLine` : comptabilité ;
- modèles Health : données cliniques ;
- modèles Pharmacy : données réglementaires et quantités spécialisées.

Référence : `docs/ERP_FINAL_DATA_OWNERSHIP.md`.

## 9. Finance et comptabilisation

Toute écriture respecte :

```text
événement métier
→ validation
→ clé d’idempotence
→ Posting Engine
→ Journal Entry
→ Journal Lines
→ Σ débits = Σ crédits
```

Une écriture `POSTED` est immuable. Les corrections utilisent une contrepassation liée puis, si nécessaire, une nouvelle écriture.

Les périodes `CLOSED`/`LOCKED` ne reçoivent aucune écriture. Les rapports utilisent uniquement les écritures communes `POSTED` et n’additionnent pas des devises incompatibles.

Un paiement, une allocation, une facture et un document opérationnel restent des objets distincts.

Références :

- `docs/ERP_FINANCE_ARCHITECTURE.md`
- `docs/ERP_ACCOUNTING_MODEL.md`
- `docs/ERP_POSTING_RULES.md`
- `docs/ERP_TREASURY_MODEL.md`
- `docs/ERP_FINANCIAL_SECURITY.md`

## 10. Pharmacy

Pharmacy reste autoritaire pour :

- produits réglementés ;
- lots ;
- FEFO ;
- péremption ;
- rappels et blocages ;
- qualité ;
- pharmacovigilance ;
- prescriptions ;
- quantités réglementées.

Les tiers, catalogues, achats, factures, paiements, caisses et écritures communs sont reliés par des extensions et mappings tenant-scoped, idempotents et observables.

Une mutation financière Pharmacy ne doit jamais créer une seconde facture, un second paiement ou une seconde caisse.

Références :

- `docs/ERP_PHARMACY_CONVERGENCE_MAP.md`
- `docs/ERP_SECTOR_FINANCIAL_MAPPING.md`
- `docs/ERP_SECTOR_CUTOVER_PLAN.md`

## 11. Health

Health reste autoritaire pour :

- patients ;
- rendez-vous ;
- consultations ;
- dossiers médicaux ;
- laboratoire ;
- prescriptions ;
- documents cliniques ;
- règles de prise en charge.

Le Core financier reçoit uniquement les informations nécessaires à la facturation : tiers financier, service, montant, payeur, facture, créance, paiement et allocation. Il ne reçoit ni diagnostic, symptôme, prescription, résultat de laboratoire, note médicale ou historique clinique.

Les composantes patient/assureur d’une facture convergent vers une facture commune et des créances/allocations explicites.

Références :

- `docs/ERP_HEALTH_CONVERGENCE_MAP.md`
- `docs/ERP_SECTOR_DATA_CLASSIFICATION.md`
- `docs/ERP_FINAL_SECURITY_REVIEW.md`

## 12. Workflow Engine v2

Le moteur actif repose sur des définitions, versions et instances dédiées. Les transitions sont autorisées, auditées et idempotentes.

`EnterpriseWorkflow` historique n’accepte plus de création ou édition. L’administration renvoie `410 Gone` pour les mutations legacy et oriente vers Workflow Engine v2.

Références :

- `docs/ENTERPRISE_WORKFLOW_ENGINE.md`
- `docs/ERP_FINAL_LEGACY_INVENTORY.md`

## 13. Legacy et Release A

La Release A retire les chemins d’écriture sans destruction physique :

| Objet | État |
|---|---|
| `EnterpriseCoreRecord` | historique paginé, `LEGACY_READ_ONLY`, mutations `410 Gone` |
| `EnterpriseSectorRecord` | historique paginé, `LEGACY_READ_ONLY`, mutations Health/Pharmacy `410 Gone` |
| `EnterpriseWorkflow` | archive, mutations `410 Gone` |
| workspaces génériques sectoriels | retirés du parcours actif |
| modules Health génériques sans contrat | `HIDDEN` + `EXPLICIT_DENY` |

Chaque tentative est soumise à l’authentification, au tenant, aux permissions, à same-origin, au rate limit et à l’audit.

Une Release B éventuelle peut supprimer physiquement uniquement après observation, export, sauvegarde, restauration testée, absence de dépendance et approbation explicite.

Références :

- `docs/ERP_FINAL_CUTOVER_STATUS.md`
- `docs/ERP_FINAL_DELETION_REGISTER.md`
- `docs/ERP_ROUTE_DECOMMISSION_REGISTER.md`
- `docs/ERP_FINAL_ROLLBACK_PLAN.md`

## 14. API et sécurité

Contrat général d’une route mutante :

```text
getSession
→ contexte/organisation
→ membership
→ module/entitlement
→ permission/objet
→ isSameOriginRequest
→ schéma Zod
→ await rateLimit
→ transaction Prisma
→ writeApiLog
→ writeAuditLog
```

Règles :

- pas d’IDOR ;
- pas de référence inter-tenant ;
- pas d’accès clinique par Finance ;
- pas de secret côté client ;
- pas de succès silencieux sur une route retirée ;
- erreurs métier explicites ;
- téléchargements privés via route serveur ;
- logs sans données sensibles.

## 15. Documents et fichiers

Les documents généraux utilisent `EnterpriseDocument`. Les documents médicaux restent contrôlés par Health ; les documents réglementaires restent contrôlés par Pharmacy.

Tout upload valide MIME, taille, organisation, classification et permissions. Les fichiers sont stockés de façon privée ; les téléchargements sensibles sont audités.

Les documents ambigus ne sont pas rendus publics et ne sont pas reliés automatiquement sur une similarité de texte.

## 16. Notifications et deep links

Les nouvelles notifications utilisent des routes canoniques et ouvrent :

```text
module
+ objet précis
+ section pertinente
```

Le backend revalide l’accès à la destination. Une notification verrouillée reste générique et ne révèle aucune donnée clinique, salariale, juridique ou financière sensible.

Les aliases historiques servent uniquement aux anciennes notifications/liens qui doivent rester lisibles.

## 17. UI/UX standard

Primitives communes :

- `ModuleWorkspace`
- `ModuleHeader`
- `ModuleMetrics`
- `ModuleContent`
- `ModuleSection`
- `BusinessList`
- `BusinessListItem`
- `BusinessDetail`
- `ContextActions`
- `StatusBadge`
- `EmptyState`

Les workspaces évitent les cartes imbriquées, utilisent des actions réelles, des menus contextuels cohérents, une pagination serveur et des libellés métier traduits.

Mobile : rail KPI horizontal local, `min-w-0`, aucun débordement global, formulaires/détails plein écran, clavier iPhone, selects tactiles, dialogs scrollables et safe areas.

## 18. PWA et hors ligne

Le service worker ne met jamais en cache :

- `/api/*` ;
- les pages privées HTML ;
- les réponses d’authentification ;
- les données utilisateur/tenant.

Le fallback offline reste public, autonome et sans donnée privée. Web Push et notifications nécessitent un abonnement serveur valide et des permissions utilisateur explicites.

## 19. Prisma et migrations

- schéma multi-fichiers dans `prisma/` ;
- migrations historiques immuables ;
- modifications additives privilégiées ;
- foreign keys et index tenant-aware ;
- suppression physique en deux releases ;
- installation depuis une base vide obligatoire ;
- aucune dépendance cachée à un backfill manuel.

Le Quality Gate démarre PostgreSQL, exécute les migrations depuis zéro, génère Prisma et vérifie la parité Finance.

## 20. Audits finaux

```bash
pnpm audit:erp-cutover -- --dry-run --json --output artifacts/erp-cutover.json
pnpm audit:financial-integrity -- --json
```

L’audit cutover produit : `READY`, `READY_WITH_ARCHIVE`, `BLOCKED`, `MANUAL_REVIEW`.

L’audit financier contrôle notamment : équilibre débit/crédit, factures sans créance, factures payées avec solde, allocations excessives, soldes négatifs, périodes fermées et postings sectoriels dupliqués.

Les sorties restent agrégées et n’exposent pas de contenu médical ou financier sensible.

## 21. QA

Commandes principales :

```bash
pnpm prisma generate
pnpm type-check
pnpm lint
pnpm qa:regression
pnpm build
```

QA finales :

- `qa:erp-final-cutover`
- `qa:erp-legacy-readonly`
- `qa:erp-deprecated-routes`
- `qa:erp-single-source-of-truth`
- `qa:erp-final-security`
- `qa:erp-clean-install`
- `qa:erp-production-readiness`

Les QA historiques, Core v2, Finance, Pharmacy, Health, workflows, responsive, mobile, sessions et collaboration restent obligatoires.

## 22. CI/CD et Production

```text
branche feature
→ contrôles locaux
→ commits
→ push
→ Pull Request
→ GitHub Quality Gates
→ revue
→ merge main
→ prisma migrate deploy
→ pnpm build
→ Vercel Production
```

Aucun déploiement manuel n’est autorisé depuis une branche. Les previews désactivées sont normales.

Après merge, vérifier dans l’ordre : SHA merge, SHA `main`, SHA Production, migrations, build, authentification, tenant, Core, Finance, Pharmacy, Health, workflows, notifications, rapports, mobile, sécurité, intégrité comptable et absence d’écriture legacy.

Références :

- `docs/ERP_FINAL_OPERATIONAL_RUNBOOK.md`
- `docs/ERP_FINAL_PRODUCTION_CHECKLIST.md`
- `docs/ERP_FINAL_MIGRATION_REPORT.md`

## 23. Rollback

Le rollback reste non destructif : désactiver une route/domaine, restaurer une lecture ou redirection protégée, conserver toutes les données et mappings, puis rejouer idempotemment après correction.

Une écriture comptable est corrigée par contrepassation ; une facture/paiement/allocation confirmé ne se supprime pas. Aucun rollback ne doit perdre un lot Pharmacy ou un dossier Health, ni exposer une donnée médicale.

## 24. Documentation de référence

- `AGENTS.md`
- `docs/ERP_FINAL_ARCHITECTURE.md`
- `docs/ERP_FINAL_DATA_OWNERSHIP.md`
- `docs/ERP_MODULE_INVENTORY.md`
- `docs/ERP_FINAL_PERMISSION_MATRIX.md`
- `docs/ERP_FINAL_SECURITY_REVIEW.md`
- `docs/ERP_FINAL_OPERATIONAL_RUNBOOK.md`
- `docs/ERP_FINAL_ROLLBACK_PLAN.md`
- `docs/ERP_FINAL_PRODUCTION_CHECKLIST.md`
- `docs/CHANGELOG_ERP_CONSOLIDATION_ITERATION_05.md`

La documentation historique reste accessible dans Git ; ce document représente l’architecture active après la consolidation ERP 5/5 Release A.

## Addendum 2026-08-01 — ERP professionnel, itération 2

Les modules `CRM_CUSTOMERS`, `CATALOG`, `SITES_WAREHOUSES`, `CRM_PIPELINE` et `CONTRACTS` utilisent désormais des workspaces dédiés. Les créations et modifications passent par des services métier transactionnels, une validation Zod, un contrôle de révision et des événements opérationnels.

L’identité relationnelle dispose d’un résolveur serveur d’avantages, d’un worker d’expiration borné et de cibles fournisseur/RH supplémentaires. La migration `20260801170000_professionalize_erp_iteration_02` est additive.
