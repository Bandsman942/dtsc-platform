# DTSC Platform — Documentation technique

**Version :** Consolidation ERP + modules standards 8/8 + DTSC AI 08/08
**Repository :** `Bandsman942/dtsc-platform`
**Production :** déploiement Vercel exclusivement depuis `main`

## 1. Objet

Ce document est le point d’entrée technique de DTSC Platform. Les règles exécutables se trouvent dans les fichiers `AGENTS.md`. Les contrats détaillés restent dans les documents spécialisés du dossier `docs/`.

La plateforme réunit : site public, compte/authentification, SaaS multi-entreprises, console interne DTSC, support, collaboration, ERP commun, extensions Health/Pharmacy, IA, PWA et notifications.

## 2. Stack

| Couche | Technologie |
|---|---|
| Framework | Next.js App Router 15 |
| Interface | React 19, TypeScript, Tailwind CSS |
| Validation | Zod |
| ORM | Prisma 6 multi-fichiers |
| Base | PostgreSQL |
| Hébergement | Vercel |
| Authentification | session serveur et cookie HTTP-only signé |
| QA | scripts Node dédiés, type-check, lint et build |

## 3. Produits et sous-domaines

```text
dtsc-platform.com          site public
account.dtsc-platform.com  compte et authentification
app.dtsc-platform.com      application SaaS
console.dtsc-platform.com  console interne DTSC
support.dtsc-platform.com  support client
```

Les helpers de domaine centralisent les URL. Le middleware protège les produits, exclut les assets et `/api/*` des réécritures, garde le fallback offline public et interdit l’exposition directe de la console dans l’application cliente.

## 4. Authentification et contexte

La session identifie l’utilisateur, le rôle global, le contexte actif et l’organisation active éventuelle.

- `DTSC_INTERNAL` : espace interne ;
- `ORGANIZATION` : entreprise cliente ;
- `GLOBAL_CLIENT` : compte client global.

Une URL, un body ou une clé étrangère fournie par le navigateur n’est jamais une preuve d’accès.

## 5. Isolation multi-tenant

Toute requête métier vérifie :

```text
session
→ activeOrganizationId
→ membership actif
→ organisation CLIENT
→ module actif
→ entitlement
→ permission
→ visibilité de l’objet
```

Toutes les références structurantes sont revalidées dans le même `organizationId`. Les rôles globaux, un rôle `MANAGER` générique ou une relation active avec une entreprise ne donnent aucun accès implicite à la Finance d’un tenant.

## 6. Registre canonique et maturité

Le registre canonique ERP définit les codes, statuts, routes, workspaces, permissions, dépendances, plans et QA des modules ERP. `EnterpriseModule` active un module pour un tenant, mais ne peut ouvrir un code absent, masqué ou non entitled.

Le registre canonique standard `lib/modules/standard-module-registry-data.json` décrit séparément les surfaces SaaS globales, entreprise standard, internes DTSC, Console, publiques, Account et Support. Une entrée standard qui consomme un moteur ERP déclare `erpDependencies` et ne devient jamais une seconde source de vérité.

La maturité commerciale est séparée du statut technique :

- `BACKEND_READY` ;
- `READ_ONLY_UI` ;
- `OPERATIONAL_UI` ;
- `PROFESSIONAL_READY` ;
- `COMMERCIAL_READY`.

Une promotion vers `COMMERCIAL_READY` exige une décision explicite du propriétaire après validation E2E authentifiée et Production stable. Les audits refusent toute promotion automatique des modules standards.

## 7. ERP commun

Le Core comprend : tiers, catalogue, sites/entrepôts, CRM, devis, contrats, commandes, livraisons, fournisseurs, achats, stock, RH/paie client, projets, temps, actifs, documents, workflows, rapports et IA.

Une source de vérité unique est conservée par domaine. Les anciens objets legacy restent en lecture seule lorsqu’une migration destructive n’est pas justifiée.

## 8. Finance opérationnelle — Itération 4

Modules dédiés :

- `FINANCE_OVERVIEW` ;
- `FINANCE_RECEIVABLES` ;
- `FINANCE_PAYABLES` ;
- `FINANCE_PAYMENTS` ;
- `FINANCE_TREASURY` ;
- `FINANCE_CASH` ;
- `FINANCE_BANK` ;
- `FINANCE_RECONCILIATION`.

Les factures, créances/dettes, paiements, allocations, comptes financiers, caisse, banque, transferts et rapprochements restent des objets distincts et durables.

## 9. Comptabilité et Finance avancée — Itération 5

Modules dédiés :

- `FINANCE_ACCOUNTING` ;
- `FINANCE_TAX` ;
- `FINANCE_CLOSE` ;
- `FINANCE_STATEMENTS` ;
- `FINANCE_ASSETS` ;
- `FINANCE_INVENTORY`.

### 9.1 Moteur comptable unique

```text
événement métier validé
→ registre de posting allow-listé
→ règle et comptes actifs
→ période autorisée
→ clé d’idempotence
→ lot de comptabilisation
→ écriture
→ lignes
→ Σ débits = Σ crédits
```

`EnterpriseJournalEntry` et `EnterpriseJournalLine` sont l’unique grand livre commun. Une écriture `POSTED` est immuable. Une correction utilise une contrepassation liée ou une nouvelle écriture corrective.

### 9.2 Workspaces avancés

Le workspace Finance avancée expose :

- plan comptable et comptes ;
- exercices et périodes ;
- journaux et écritures ;
- grand livre et balance ;
- règles et anomalies ;
- codes et taux fiscaux ;
- checklist de clôture ;
- états dynamiques et versions publiées ;
- immobilisations et amortissements ;
- valorisation comptable du stock.

Les listes volumineuses sont paginées côté serveur. Les interfaces françaises n’affichent ni UUID, ni enum brute, ni type Prisma.

### 9.3 Périodes et clôture

- `OPEN` : opérations normales ;
- `SOFT_CLOSED` : ajustements contrôlés ;
- `CLOSED` : mutations normales bloquées ;
- `LOCKED` : réouverture standard interdite.

Une réouverture exige permission, motif, acteur indépendant et audit. Elle ne supprime aucune écriture ni version publiée.

### 9.4 Fiscalité

Les codes fiscaux utilisent des taux à date d’effet. Un changement de taux ne modifie jamais les transactions historiques. Le produit ne prétend pas automatiser une déclaration légale universelle.

### 9.5 États financiers

Un aperçu dynamique est recalculable. Une version publiée est horodatée, liée à ses paramètres, protégée par une empreinte et non modifiable.

### 9.6 Immobilisations

Un actif opérationnel devient une immobilisation uniquement après capitalisation contrôlée. La méthode actuellement exposée est l’amortissement linéaire mensuel, réellement supporté et idempotent.

### 9.7 Valorisation du stock

Le stock physique reste l’autorité des quantités. La Finance utilise les couches de coût moyen pondéré et les événements comptables. Une consultation de valorisation ne modifie jamais le stock physique.

## 10. Documents, commentaires et notifications

Les pièces financières utilisent le stockage privé et les liens structurels. Les commentaires restent distincts des décisions de workflow et sont modifiables seulement selon la politique d’auteur.

Les notifications utilisent des liens profonds vers le module, l’objet et la section utile. Le backend revalide toujours l’accès à la destination.

## 11. API et sécurité

Contrat général d’une route mutante :

```text
getSession
→ organisation et membership
→ module/entitlement
→ permission et objet
→ same-origin
→ Zod
→ await rateLimit
→ transaction Prisma
→ ApiLog
→ AuditLog
```

Règles : aucun IDOR, aucune référence inter-tenant, aucun secret côté client, aucun log de document complet, salaire individuel, compte bancaire complet ou donnée clinique.

Les codes d’erreur Finance sont transformés en messages métier actionnables sans perdre leur valeur d’observabilité.

## 12. UI/UX

Primitives : `ModuleWorkspace`, `ModuleHeader`, `ModuleMetrics`, `ModuleToolbar`, `ModuleContent`, `ModuleSection`, `BusinessList`, `BusinessDetail`, `ContextActions`, `StatusBadge` et `EmptyState`.

Mobile : rail KPI horizontal local, `min-w-0`, aucun débordement global, champs à taille tactile, clavier numérique pour les montants, dialogs scrollables et formulaires utilisables à 320–412 px.

## 13. Prisma et migrations

- schéma multi-fichiers dans `prisma/` ;
- migrations historiques immuables ;
- évolutions additives privilégiées ;
- clés et index tenant-aware ;
- aucune suppression d’écriture, ligne, période utilisée, état publié, amortissement ou valorisation ;
- installation depuis une base vide obligatoire ;
- aucune dépendance cachée à un backfill manuel.

La fondation standard de l’itération 1 est statique et n’introduit aucune migration Prisma.

## 14. Audit d’intégrité

```bash
pnpm audit:financial-integrity -- --organization-id <id> --period-id <id> --json
```

Filtres supportés : organisation, période, plage de dates, journal, compte, JSON et fichier de sortie.

L’audit contrôle notamment : équilibre, lignes et en-têtes, sources, écritures sans lignes, balance, factures sans créance/dette, soldes incohérents, allocations excessives, périodes fermées, postings sectoriels dupliqués et contrepassations dupliquées.

Les sorties sont agrégées et ne réparent jamais silencieusement les données.

## 15. QA

Commandes principales :

```bash
pnpm prisma generate
pnpm type-check
pnpm lint
pnpm qa:regression
pnpm build
```

Fondations standards :

```bash
pnpm qa:standard-module-registry
pnpm qa:standard-module-navigation
pnpm qa:standard-module-routes
pnpm qa:standard-module-permissions
pnpm qa:standard-module-guides
pnpm qa:standard-module-language
pnpm qa:standard-module-mobile
pnpm qa:standard-module-multi-domain
pnpm qa:standard-module-readiness
pnpm qa:standard-modules-iteration-01
```

La CI démarre PostgreSQL, applique toutes les migrations depuis zéro, génère Prisma, exécute les audits, vérifie la parité Finance, le type-check, la régression incluant l’itération standard, le lint et le build.

## 16. CI/CD et Production

```text
branche feature
→ contrôles
→ Pull Request
→ GitHub Quality Gates
→ revue
→ merge dans main
→ prisma migrate deploy
→ pnpm build
→ Vercel Production
→ E2E manuels du propriétaire
```

Aucun `vercel deploy` ou `vercel --prod` n’est lancé depuis une branche. Les previews désactivées sont normales.

Après merge : vérifier SHA fusionné, SHA `main`, SHA Production, migrations, build, authentification, sélection du tenant, navigation, Finance, Health, Pharmacy, modules standards, PWA/Web Push, aliases, logs critiques et audits applicables.

## 17. Rollback

Le rollback est non destructif. Il peut masquer une action ou bloquer une route mutante tout en conservant les lectures et tout l’historique.

Il ne doit jamais supprimer, modifier ou recréer : écriture, ligne, contrepassation, période, état publié, amortissement, valorisation ou séquence.

Pour le registre standard, le rollback peut retirer une intégration de navigation ou déclasser honnêtement un statut, mais ne doit jamais promouvoir un module ni inventer une route de remplacement.

## 18. Documentation spécialisée

Références principales ERP :

- `docs/ERP_FINANCE_ARCHITECTURE.md`
- `docs/ERP_ACCOUNTING_MODEL.md`
- `docs/ERP_POSTING_RULES.md`
- `docs/ERP_FINANCIAL_SECURITY.md`
- `docs/ERP_ACCOUNTING_INTEGRITY_CONTROLS.md`

Références principales standards :

- `docs/STANDARD_MODULE_INVENTORY.md`
- `docs/STANDARD_MODULE_PROFESSIONAL_STANDARD.md`
- `docs/STANDARD_MODULE_DOMAIN_ARCHITECTURE.md`
- `docs/STANDARD_MODULE_NAVIGATION_CONTRACT.md`
- `docs/STANDARD_MODULE_PERMISSION_MODEL.md`
- `docs/STANDARD_MODULE_RESPONSIVE_CONTRACT.md`
- `docs/STANDARD_MODULE_ACCESSIBILITY_CONTRACT.md`
- `docs/STANDARD_MODULE_LANGUAGE_CONTRACT.md`
- `docs/STANDARD_MODULE_USER_GUIDES_INVENTORY.md`
- `docs/STANDARD_MODULE_USER_GUIDE_CONTRACT.md`
- `docs/STANDARD_MODULE_COMMERCIAL_READINESS.md`
- `docs/MANUAL_E2E_STANDARD_MODULES_ITERATION_01.md`

## 19. Contrôle des projections inter-modules ERP

La consolidation utilise l’outbox durable d’événements métier. Chaque consommateur reçoit un reçu `EnterpriseCrossModuleProjection` idempotent avec état de reprise, erreur et liens profonds exacts. Les extensions sectorielles continuent de référencer les objets communs Finance, stock et comptabilité.

## 20. Fondations des modules standards — Itération 1/8

### 20.1 Registre

Le registre standard couvre les modules non ERP sans modifier l’autorité du registre ERP. Il centralise code, labels, description, famille, domaine, statut, maturité, route, host, icône, ordre, politique d’accès, permissions, plan, abonnement, dépendances, guide, QA, aliases et routes legacy.

### 20.2 Navigation

`components/layout/nav-links.tsx` résout les surfaces globales depuis les métadonnées canoniques. Les traversées PUBLIC, APP, ACCOUNT, CONSOLE et SUPPORT passent par les helpers de domaine. Les shells partagés sont des exceptions explicites auditées, jamais des collisions silencieuses.

### 20.3 Accès et capacités

`resolveStandardModuleAccess` produit une décision structurée avec reason code, message, plan requis, dépendances manquantes et capacités. Cette décision de module précède les contrôles d’objet ; elle ne les remplace pas.

### 20.4 PWA, session et Web Push

Cette itération réutilise les contrats existants : cookie partagé contrôlé, redirection interne fiable, session inactive/révoquée, fallback offline public, absence de cache privé et Web Push conditionné par la configuration serveur. Les comportements navigateur restent dans la checklist E2E manuelle.

### 20.5 Maturité

Aucune promotion vers `COMMERCIAL_READY` n’est réalisée. Les guides absents, routes BETA et validations navigateur restent des écarts visibles dans les audits et les inventaires.

**Tests E2E manuels préparés — validation du propriétaire en attente**

## Modules standards — Itération 03 : collaboration

La collaboration utilise `CollaborationGroup` comme agrégat canonique pour les conversations directes et de groupe. `directKey` garantit l’unicité par contexte. Les messages utilisent `clientMessageId`, lectures persistées, réactions, pièces jointes privées et modération auditée.

Les appels réutilisent LiveKit et `CollaborationGroupCall`. Les transitions, l’expiration de sonnerie et les durées sont décidées côté serveur. Les annonces utilisent une audience serveur et des commentaires paginés. Voir les documents `STANDARD_COLLABORATION_*`, `STANDARD_CALLS_*`, `STANDARD_ANNOUNCEMENTS_MODEL.md` et `STANDARD_MODERATION_MODEL.md`.

## 21. Modules standards — Itération 04 : coordination du travail

### 21.1 Calendrier agrégé

`/api/calendar/unified` agrège les événements autorisés de la période visible : calendrier, tâches, demandes, validations, réunions, instances de workflow et documents à échéance. Chaque entrée conserve `sourceType`, `sourceId`, le contexte, le fuseau et un lien profond. Une projection calendrier liée adopte la clé de l'objet canonique, puis la projection source la remplace dans la déduplication.

La plage est limitée à quatre-vingt-treize jours et chaque source est bornée. Le filtre temporel et la visibilité des workflows sont combinés dans des groupes `AND` distincts pour éviter qu'un `OR` n'en écrase un autre.

### 21.2 Coordination des tâches et demandes

Les extensions additives comprennent : checklists, dépendances, blocages et filtres personnels. La progression est calculée uniquement depuis une checklist réelle. Les dépendances sont tenant-scoped et les cycles sont refusés.

Les demandes disposent d'un cycle d'information, réponse, résolution, clôture et réouverture avec commentaires et événements. Les interfaces ouvrent l'objet exact depuis `?task=` et `?request=` après contrôle serveur.

### 21.3 Validations versionnées

Une validation conserve des versions de soumission et des décisions idempotentes. La correction exige un motif, la resoumission crée une nouvelle version et la délégation vérifie le membership du nouveau validateur. Les services métier existants restent responsables de la décision finale sur les achats, budgets, dépenses et autres sources.

### 21.4 Réunions

L'ordre du jour, les versions de compte rendu et les liens réunion-tâche sont persistés. Une décision peut créer une vraie tâche par la route dédiée. Les appels réutilisent Collaboration ; aucun second moteur audio/vidéo n'est créé.

### 21.5 Workflows

Le moteur `EnterpriseWorkflow*` existant reste canonique : définitions, versions, étapes, transitions, instances, tentatives idempotentes, événements et outbox. Une instance reste liée à sa version d'origine. Les reprises temporelles peuvent être projetées dans le Calendrier.

### 21.6 Documents

Les documents utilisent `EnterpriseDocument`, `EnterpriseDocumentVersion`, les accès privés, le stockage signé et `EnterpriseEntityLink`. L'itération 04 ne crée ni table de fichiers ni table de liens concurrente. Les listes chargent les métadonnées et demandent les fichiers à la demande.

### 21.7 QA et documentation

Les scripts `qa:standard-*` de l'itération 04 convergent vers `scripts/qa-standard-work-coordination-checks.mjs` et sont inclus dans `qa:regression`. Les modèles détaillés, la matrice de permissions, les liens profonds, les notifications, les neuf guides et le plan E2E sont référencés par `docs/STANDARD_MODULE_ITERATION_04_AUDIT.md`.

La PR peut viser `PROFESSIONAL_READY` uniquement après Quality Gates, revue, fusion et vérification Production. `COMMERCIAL_READY` reste interdit sans E2E explicite du propriétaire.

**Tests E2E manuels préparés — validation du propriétaire en attente**
## Itération 05 — Couche IA gouvernée

La couche `lib/ai/` fournit types, catalogue, classification, abstraction fournisseur, orchestration/fallback, erreurs stables, prompts versionnés, registre d’outils, i18n des erreurs, coûts et observabilité. Les routes existantes `/api/chat/v2` et `/api/enterprise/ai/chat` l’utilisent sans recréer leurs historiques. La migration `20260804173000_standard_ai_governance_iteration_05` ajoute les appels modèle et les preuves/transitions de maturité, plus les métadonnées linguistiques de connaissance. La console `/admin/erp-readiness` devient la surface canonique ERP + standards en matrice/Kanban.

### DTSC AI 00/08 — Policy Governance

Le Policy Engine `lib/ai/policy.ts` rend opposables avant provider le contexte, le plan effectif résolu côté serveur, les capacités requises, la fenêtre de contexte et la classification des données. Un provider inconnu est considéré externe jusqu'à certification ; `SECRET` n'est jamais transmis à un provider externe et les classifications sensibles externes sont refusées par défaut.

### DTSC AI 01/08 — Provider abstraction et streaming normalisé

AI01 découple le runtime applicatif des événements natifs OpenAI Responses. `lib/ai/provider.ts` devient la façade canonique d'adapters ; `lib/ai/providers/openai-responses.ts` contient le transport HTTP/SSE et traduit les événements natifs vers `AiProviderEvent` (`TEXT_DELTA`, `TOOL_CALL_DELTA`, `TOOL_CALL_COMPLETED`, `USAGE`, `COMPLETED`, `ERROR`). `lib/ai/stream.ts` consomme uniquement ce contrat normalisé.

Les protocoles `OPENAI_CHAT_COMPLETIONS` et `OPENROUTER_CHAT_COMPLETIONS` sont préparés dans le type et le catalogue, mais restent fail-closed tant qu'un adapter certifié n'est pas livré. OpenRouter n'est donc pas activé par AI01.

La cancellation est propagée au reader provider. Un flux qui se termine sans `COMPLETED` devient `STREAM_INTERRUPTED`; un événement provider `ERROR` arrête le flux amont. La migration additive `20260810065000_ai_provider_attempt_observability` introduit `AiProviderAttempt` pour tracer l'ordre, le provider/modèle, le statut, le reason code et la durée de chaque tentative sans prompt, message ou secret. `AiModelCall` reste l'unité applicative de consommation ; plusieurs tentatives techniques ne créent pas un double comptage quota/coût.

Les gates `qa-standard-ai-provider-adapters`, `qa-standard-ai-normalized-stream`, `qa-standard-ai-stream-cancellation` et `qa-standard-ai-provider-attempts` sont raccordées à l'agrégateur de l'itération 05 et doivent rester vertes avec AI00, la régression ERP, type-check, lint, migrations et build.

### DTSC AI 02/08 — OpenRouter et modèles certifiés

AI02 rend `OPENROUTER_CHAT_COMPLETIONS` exécutable derrière la façade AI01 sans modifier l'autorité AI00. `lib/ai/providers/openrouter-chat-completions.ts` normalise texte, outils, usage, erreurs et cancellation dans `AiProviderEvent`.

OpenRouter n'est jamais une source de vérité de catalogue : aucun modèle n'est activé par défaut et `AI_OPENROUTER_CERTIFIED_MODELS_JSON` est la seule allow-list OpenRouter. Le catalogue générique ne peut pas injecter de modèle OpenRouter, une certification exige une version explicite et ne peut pas écraser un code modèle DTSC existant.

Chaque requête OpenRouter impose `allow_fallbacks:false`, `data_collection:"deny"` et `zdr:true`. Les fallbacks restent donc décidés et audités par DTSC, et l'accès à un modèle reste soumis au plan, au contexte, aux capacités et à la politique de données. Le script `scripts/ai/audit-openrouter-catalog.mjs` compare les modèles certifiés au catalogue ZDR compatible en lecture seule ; il n'active ni ne modifie aucun modèle.

`/api/models` expose uniquement les modèles déjà filtrés par le runtime, avec des métadonnées non sensibles de profil/certification. Les gates AI02 contrôlent l'adapter, la certification, les fallbacks inter-provider, le statut externe par défaut et la parité UI/runtime. Aucun changement Prisma n'est introduit par AI02.

## Modules standards — Itération 06 — Gouvernance d’entreprise (2026-08-05)

L’itération 06 professionnalise Budgets, Rapports et Administration entreprise sans dupliquer les moteurs ERP. Les budgets utilisent des versions additives, scénarios, gel, prévisions et alertes ; les métriques communes sont définies dans `lib/enterprise/reporting/metric-registry.ts`. L’administration ajoute rôles d’organisation, simulation de permissions, politiques de sécurité, protection du dernier administrateur, hiérarchie des départements et audit enrichi. La migration `20260805003000_standard_enterprise_governance_iteration_06` est additive. Les guides natifs sont dans `lib/user-guides/iteration06-guides.ts` et la QA agrégée est `pnpm qa:standard-modules-iteration-06`.

## Console DTSC — professionnalisation Itération 07

La Console globale utilise désormais des routes canoniques sous `/admin`, des datasets paginés dans `lib/console`, des capacités serveur explicites, des guides natifs et des audits dédiés. Les synchronisations financières ont été retirées du rendu. Voir `docs/STANDARD_DTSC_CONSOLE_ARCHITECTURE.md` et les contrats Console associés.

## Remédiation E2E itération 7 v3 — contrats transverses

### Progression opérationnelle

`lib/operational-progress.ts` centralise le calcul de progression et les gardes de clôture. Les routes de statut et de checklist ne font plus confiance à une valeur de progression saisie par le client. Les tâches COO liées à une opération et les éléments `OperationalChecklistItem` sont agrégés dans la même règle déterministe.

### Quotas IA et facturation

`lib/billing/ai-usage-limits.ts` résout le plan actif selon le contexte organisationnel ou personnel. `lib/billing/entitlements.ts` projette les champs administrables du plan vers les limites de l’Assistant IA entreprise. Le catalogue initial est défini une seule fois dans `config/billing-plans.bootstrap.json`; les modifications ultérieures restent versionnées en base.

### Actions flottantes

`FloatingActionHubProvider` fournit un registre client global. Les modules enregistrent une définition d’action au lieu de monter leur propre bouton fixe. Le hub rend une seule commande avec tri, safe area, fermeture avant navigation et actions mobiles conditionnelles.

### Guides et i18n

`scripts/audit-user-guide-contract.mjs` valide la structure et les fonctionnalités documentées. `scripts/audit-iteration-07-i18n-contract.mjs` contrôle les parcours corrigés et compare l’application à `config/i18n-hardcoded-baseline.json`; le nombre de libellés probables codés en dur ne peut plus augmenter sans correction explicite.

## Delivery Governance v1

Le workflow officiel est défini dans `docs/DELIVERY_GOVERNANCE.md`. Les agents suivent `docs/AGENT_DELIVERY_RUNBOOK.md`; le rapport du vendredi suit `docs/WEEKLY_DELIVERY_REPORT_CONTRACT.md`. Les checks canoniques requis sont `Delivery governance`, `Quality` et `Migration`. Vercel publie nativement le statut `Production` sur GitHub ; seule sa réussite autorise la GitHub Release.

## DTSC AI — RAG V2 / Knowledge Engine (AI05)

AI05 conserve PostgreSQL/pgvector et les modèles documentaires existants comme sources de vérité, sans index parallèle. Les embeddings passent désormais par `lib/ai/embeddings.ts`, avec identité provider/modèle/dimension/version et batch borné. Les index historiques restent explicitement `legacy-openai-1536-v1` jusqu’à réindexation contrôlée.

Les uploads personnels et Enterprise persistent stockage + texte extrait, retournent `202 PROCESSING`, puis terminent l’indexation avec `after()`. Les insertions de chunks sont idempotentes via SHA-256 + `indexVersion`. Le retrieval Enterprise filtre tenant, statut, archive, confidentialité, secteur/module et compatibilité d’index avant un ranking hybride pgvector + PostgreSQL lexical, puis un reranking optionnel avec fallback déterministe.

Les classifications RAG sélectionnées (dont `HEALTH_SENSITIVE`, `HR_SENSITIVE`, `FINANCIAL_SENSITIVE`, `LEGAL_SENSITIVE`) sont fusionnées avec celles du Context Engine avant passage au Policy Router. Aucun reindex global automatique n’est autorisé en Production ; le planificateur `scripts/ai/plan-rag-reindex.mjs` est dry-run et borné.

Documentation canonique : `docs/STANDARD_AI_KNOWLEDGE_RAG_ARCHITECTURE.md`, `docs/STANDARD_AI_EMBEDDING_INDEXING.md` et `docs/STANDARD_AI_DATA_CLASSIFICATION.md`.

## AI06 — DTSC Tool Gateway

AI06 introduces the canonical Tool Gateway on top of `lib/ai/tool-registry.ts`. Certified tools require an explicit registry definition, runtime Zod schemas, an explicit executor and centralized authorization. Pharmacy READ tools are migrated behind the Gateway; private support-ticket and DTSC-contact-email actions are mutations requiring a turn-bound structural confirmation.

The additive migration `20260810002000_ai_tool_gateway_confirmation_idempotency` creates `AiToolConfirmation` and `AiToolExecution`. Idempotency is protected by a unique database scope key and an atomic `ON CONFLICT ... DO NOTHING RETURNING id` execution claim. Pending confirmations expose only sanitized previews to the browser. The canonical Prisma representation lives in `prisma/standard-ai-governance.prisma`, consistent with the repository's multi-file Prisma schema.

Dedicated AI06 QA covers runtime registry integrity, authorization, structural confirmation, idempotency, tenant isolation and private-action bypass prevention. The five official package commands are `qa:standard-ai-tool-runtime`, `qa:standard-ai-tool-authorization`, `qa:standard-ai-tool-confirmation`, `qa:standard-ai-tool-idempotency-runtime` and `qa:standard-ai-tool-tenant-isolation`.

## Annexe — DTSC AI 08/08 : Agent Runtime contrôlé

AI08 complète la chaîne Standard AI sans créer de routeur, moteur d’outils ou mémoire conversationnelle parallèle :

```text
Conversation canonique
→ Assistant Runtime / Context Engine / CAG / RAG
→ Policy Router
→ provider certifié
→ structured tool proposal
→ DTSC Tool Gateway
→ résultat audité et traité comme donnée non fiable
→ continuation bornée
→ réponse finale ou suspension/arrêt contrôlé
```

### Sources de vérité

- `lib/ai/agent/*` : policy de run, runtime interactif, persistance, outils, turns et reprise ;
- `AiAgentRun` / `AiAgentStep` : état, plafonds, étapes, outils, provider/modèle, usage, coût, durée et reason codes ;
- `routeAiStream()` : autorité unique de routage provider/modèle/policy ;
- `executeAiTool()` : autorité unique d’exécution outil ;
- `AiToolConfirmation` / `AiToolExecution` : confirmation structurelle et idempotence ;
- `Conversation` / `Message` et `EnterpriseAiConversation` / `EnterpriseAiMessage` : mémoires conversationnelles existantes.

Aucun prompt complet, copie de conversation ou chaîne de pensée privée n’est ajouté aux modèles Agent.

### Surfaces

- `POST /api/chat/agent` : Agent Chatbot global opt-in ;
- `POST /api/enterprise/ai/agent` : Agent Entreprise opt-in ;
- `GET /api/ai/agent/context` : contexte actif minimal dérivé de la session ;
- `GET /api/ai/agent/runs/:id` : statut sûr ;
- `POST /api/ai/agent/runs/:id/cancel` : cancellation ;
- `POST /api/ai/agent/runs/:id/resume` : reprise canonique ;
- `components/chat/ai-agent-run-dock.tsx` : UX commune FR/EN/mobile du mode Agent.

Les routes historiques `/api/chat/v2` et `/api/enterprise/ai/chat` restent indépendantes. Le mode Agent est donc un opt-in produit et non un remplacement implicite du chat existant.

### Budgets, confirmations et sécurité

Chaque run reçoit des plafonds serveur `maxSteps`, `maxToolCalls`, `maxTokens`, `maxEstimatedCost`, `maxDurationMs`, `allowedToolModes` et `allowedToolCodes`. Une demande client ne peut jamais les augmenter.

Une mutation nécessitant confirmation suspend le run en `WAITING_CONFIRMATION`. Après confirmation structurelle réussie, le Tool Gateway produit l’exécution canonique et le run passe `READY_TO_RESUME`. La reprise recharge le résultat côté serveur, revalide tenant, droits, plan, quotas et classifications, puis claim atomiquement le même run. Un refus clôt le run suspendu avec `CONFIRMATION_CANCELLED`.

`SENSITIVE_MUTATE` n’est pas exposé. Pour Health, Finance, RH et Legal sensibles, l’Agent reste limité à READ/PREPARE et les workflows métier canoniques conservent l’autorité finale.

### MCP et Durable Agent

AI08 peut orchestrer uniquement les outils MCP READ déjà certifiés et projetés dans le Tool Gateway. Discovery distante, ressources ou prompts MCP ne deviennent jamais une permission ou une instruction système. `SECRET` ne sort pas vers MCP/provider externe.

La classe `DURABLE` reste réservée mais inactive. DTSC ne simule pas un agent background par une requête HTTP longue ; tout raccord durable futur doit réutiliser une infrastructure de worker réellement persistante et disposer de ses propres contrats/QA.

### Observabilité et UX

L’interface affiche uniquement l’état sûr du run : progression, outils, plafonds, tokens, coût estimé, confirmations, reason codes, annulation et reprise. Elle n’affiche ni prompts, ni arguments bruts, ni raisonnement privé.

Les traces provider (`AiProviderAttempt`), appels modèle (`AiModelCall`), exécutions outil (`AiToolExecution`), audits MCP et runs/steps Agent restent complémentaires afin de conserver la provenance sans double comptage fonctionnel.

### Validation et maturité

Les gates AI08 couvrent runtime/confidentialité, budgets, confirmation, reprise, UX FR/EN/mobile, idempotence, cancellation, isolation tenant et domaines sensibles. Elles sont intégrées à la régression Standard AI.

`COMMERCIAL_READY` reste interdit sans preuve sur le SHA `main` réellement déployé en Production : E2E Chatbot Agent, Assistant Entreprise, CAG+RAG, OpenRouter/fallback, READ, PREPARE, MUTATE confirmé/repris, MCP READ réellement configuré, cancellation et refus sensitive/cross-tenant.

Documents détaillés :

- `docs/STANDARD_AI_AGENT_RUNTIME.md` ;
- `docs/STANDARD_AI_AGENT_RUNBOOK.md` ;
- `docs/STANDARD_AI_TOOL_GATEWAY.md` ;
- `docs/STANDARD_AI_MCP_ARCHITECTURE.md` ;
- `docs/STANDARD_AI_ORCHESTRATION_ARCHITECTURE.md` ;
- `docs/STANDARD_AI_OBSERVABILITY_MODEL.md` ;
- `docs/user-guides/AI_AGENT_MODE_FR.md` ;
- `docs/user-guides/AI_AGENT_MODE_EN.md`.

