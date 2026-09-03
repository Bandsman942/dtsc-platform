# Offres SaaS, catalogue commercial et entitlements

Dernière mise à jour : 3 septembre 2026

Ce document décrit le contrat SaaS actif de DTSC Platform. Il sépare volontairement :

1. le **catalogue commercial publié** ;
2. l’**abonnement effectif** du compte ou de l’organisation ;
3. le **niveau technique de capacité** ;
4. les **entitlements serveur** ;
5. les **permissions métier et l’isolation tenant**.

Le principe central de Billing Catalog v2 est que le site public, `/billing`, la Console DTSC, le backend et les assistants IA ne reconstruisent plus chacun leur propre histoire commerciale.

## Source commerciale canonique

### BillingPlan reste l’autorité des prix et quotas administrés

Une offre commerciale est une ligne `BillingPlan`. Elle porte l’identité commerciale stable, l’audience, le nom administré, la description, le prix, les quotas IA journaliers et le champ historique `maxDocuments`.

Dans Billing Catalog v2, ce champ historique `BillingPlan.maxDocuments` représente le **nombre de sources de connaissance IA** de l’offre. Il ne doit jamais être confondu avec `OrganizationUsageLimits.maxDocuments`, qui représente les **documents métier ERP**.

`config/billing-plans.bootstrap.json` initialise uniquement les offres absentes avec `createMany(..., skipDuplicates: true)`. Il ne remplace pas les valeurs administrées en base.

Les sept identifiants commerciaux canoniques restent :

- `freemium` — Découverte individuelle ;
- `starter` — Individuel Essentiel ;
- `growth` — Individuel Professionnel ;
- `premium` — Individuel Premium ;
- `org-starter` — Organisation Essentielle ;
- `org-growth` — Organisation Croissance ;
- `org-premium` — Organisation Premium.

### Projection publiée Billing Catalog v2

`lib/billing/commercial-catalog.ts` expose `getPublishedBillingCatalog()`.

Cette projection :

- lit les valeurs administrées réelles de `BillingPlan` ;
- conserve uniquement les sept identités canoniques ;
- dérive le niveau de capacité depuis l’identifiant de l’offre ;
- ajoute la promesse commerciale, les limites organisation, les modules et le mode IA ;
- expose la release `2026.09` et une `releaseId` calculée à partir de la révision réelle du catalogue ;
- utilise l’historique `BillingPlanVersion` existant pour exposer la version d’offre la plus récente sans ajouter de migration destructive.

Une modification administrée de prix ou quota modifie la révision publiée. Le CAG IA utilise cette `releaseId` comme version de cache afin qu’un nouveau tour ne continue pas à raconter une ancienne grille sous une clé commerciale périmée.

## Prix et quotas de référence de la release 2026.09

Les valeurs bootstrap de référence restent inchangées :

| Offre | Prix mensuel | Messages IA / jour | Tokens / jour | Sources de connaissance IA |
| --- | ---: | ---: | ---: | ---: |
| Découverte individuelle | 0 USD | 5 | 15 000 | 1 |
| Individuel Essentiel | 2 USD | 40 | 120 000 | 2 |
| Individuel Professionnel | 15 USD | 200 | 750 000 | 20 |
| Individuel Premium | 50 USD | 1 000 | 3 000 000 | 100 |
| Organisation Essentielle | 25 USD | 500 | 1 500 000 | 50 |
| Organisation Croissance | 75 USD | 2 000 | 6 000 000 | 250 |
| Organisation Premium | 180 USD | 10 000 | 30 000 000 | 1 000 |

Ces montants sont les valeurs bootstrap de la release. Lorsqu’un administrateur DTSC modifie légalement une offre via la Console, les surfaces consomment la valeur administrée courante de `BillingPlan` au lieu de recopier ce tableau dans leur code.

## Trois limites qui ne doivent plus être confondues

### Sources de connaissance IA

Documents ou sources ingérés par les assistants IA. Le quota commercial vient de `BillingPlan.maxDocuments` pour compatibilité de schéma et est projeté vers `maxEnterpriseAiKnowledgeSources`.

### Documents métier ERP

Factures, contrats, pièces et documents opérationnels gérés par les modules métier. La limite vient de `OrganizationUsageLimits.maxDocuments` :

- Essentiel : 1 000 ;
- Professionnel : 20 000 ;
- Entreprise : 250 000.

Le quota de sources IA ne remplace jamais cette limite.

### Stockage

Capacité de stockage globale de l’organisation :

- Essentiel : 5 Go ;
- Professionnel : 50 Go ;
- Entreprise : 500 Go.

Le stockage est une limite distincte du nombre de documents et du nombre de sources IA.

## Niveaux de capacité

Le niveau technique reste dérivé par `lib/billing/plans.ts` :

- `STARTER` → **Essentiel** ;
- `BUSINESS` → **Professionnel** ;
- `ENTERPRISE` → **Entreprise**.

Ces codes servent au backend. Ils ne doivent jamais devenir le nom commercial présenté au client.

## Contrat des offres organisation

### Organisation Essentielle — structurer et collaborer

Limites générales :

- 10 utilisateurs ;
- 5 Go de stockage ;
- 300 minutes d’appels collaboratifs par mois ;
- 12 modules actifs ;
- 1 000 documents métier ;
- 50 sources de connaissance IA avec la valeur bootstrap actuelle ;
- support standard.

Fonctionnalités commerciales principales : administration entreprise de base, collaborateurs, postes, départements et permissions de base, demandes internes, documents, rapports, tiers/clients, catalogue, projets & services, calendrier, appels collaboratifs et IA Assistant Entreprise en lecture/recherche/résumé/analyse.

`collaboration-calls`, `calendar` et `enterprise-admin` exigent maintenant le niveau Essentiel **avec abonnement actif**. `AI_ASSISTANT` est commercialement inclus à partir d’Essentiel via le registre canonique.

### Organisation Croissance — gérer et automatiser

Limites générales :

- 50 utilisateurs ;
- 50 Go ;
- 3 000 minutes d’appels par mois ;
- 60 modules actifs ;
- 20 000 documents métier ;
- 250 sources de connaissance IA avec la valeur bootstrap actuelle ;
- support prioritaire.

Cette offre ajoute notamment tâches & opérations, validations, réunions, workflows, CRM pipeline, ventes, contrats, fournisseurs & achats, sites/entrepôts, stocks/logistique, RH, temps & présences, temps & livrables, actifs & maintenance et finance opérationnelle selon le registre canonique.

L’IA Entreprise peut lire les données autorisées et **préparer** des actions lorsque le rôle, la permission, le module, le paramètre IA et le Tool Gateway l’autorisent.

### Organisation Premium — piloter, comptabiliser et sectorialiser

Limites générales :

- 500 utilisateurs ;
- 500 Go ;
- 30 000 minutes d’appels par mois ;
- 250 modules actifs ;
- 250 000 documents métier ;
- 1 000 sources de connaissance IA avec la valeur bootstrap actuelle ;
- support dédié.

Cette offre ajoute les capacités Entreprise du registre : paie opérationnelle, banque, rapprochement, comptabilité, fiscalité, clôture, états financiers, finance des actifs/inventaire, gouvernance avancée et modules sectoriels avancés Health/Pharmacy lorsque le secteur et les permissions le permettent.

Le mode Agent peut exposer des modes `READ`, `PREPARE` et `MUTATE`, mais aucune mutation ne contourne les confirmations, autorisations, validations et restrictions de domaine du Tool Gateway.

## Résolution canonique de l’abonnement

`lib/billing/commercial-context.ts` reste l’autorité pour déterminer l’offre réellement appliquée.

### Organisation cliente

Le contexte organisation utilise exclusivement `OrganizationSubscription`. Il ne retombe jamais sur l’abonnement personnel ou l’offre freemium d’un membre.

Les références historiques restent reconnues :

- `freemium` / `starter` → `org-starter` ;
- `growth` → `org-growth` ;
- `premium` → `org-premium`.

Sans offre organisation valide, la baseline est restrictive et n’emprunte aucun quota personnel.

### Compte personnel

Le contexte personnel utilise :

1. un `Subscription` actif et valide ;
2. sinon l’offre `freemium` active ;
3. sinon uniquement le fallback historique des limites utilisateur.

### DTSC interne

`DTSC_INTERNAL` reste isolé des abonnements clients et conserve ses règles internes.

## Entitlements et modules

`lib/billing/entitlements.ts` reste l’autorité serveur pour :

- `getOrganizationEntitlements()` ;
- `canUseModule()` ;
- `canUseFeature()` ;
- `assertCanUseModule()` ;
- `getOrganizationUsageLimits()`.

Une promesse commerciale ne suffit jamais à lire une donnée. L’accès final reste conditionné par :

- organisation active et de type correct ;
- abonnement/période valides lorsqu’ils sont requis ;
- module configuré et activé ;
- secteur compatible ;
- membership actif ;
- rôle et permissions ;
- dépendances de modules ;
- restrictions temporaires ;
- contrôles serveur propres à chaque route.

## IA DTSC

### Assistant public

L’assistant public reçoit le catalogue depuis `getPublishedBillingCatalog()` puis `formatPublishedBillingCatalogForAi()`.

Il peut citer un prix d’**abonnement DTSC Platform** uniquement depuis cette source. Il ne transforme jamais ce montant en devis de conseil, intégration, formation ou développement. Si le catalogue n’est pas disponible, il doit s’abstenir de donner un prix et orienter vers `/tarifs`.

### Chatbot général privé

Le chatbot général reçoit le catalogue versionné via le CAG mais reste volontairement personnel/produit : il n’accède jamais aux données ERP de l’entreprise active.

### IA Assistant Entreprise

L’assistant reçoit l’offre effective, le statut, les quotas, la limite de sources IA, les documents métier, le stockage, les appels et les modules réellement lisibles.

Les modes d’outils sont bornés commercialement dans la route Agent Entreprise :

- Essentielle : `READ` uniquement ;
- Croissance : `READ` + `PREPARE` ;
- Premium : `READ` + `PREPARE` + `MUTATE`.

Ces modes sont seulement un plafond. `authorizeAiTool()`, le Tool Gateway, les permissions métier, les classifications sensibles et les confirmations peuvent encore réduire ou refuser l’exécution.

## Surfaces

### `/tarifs`

Page publique alimentée directement par `getPublishedBillingCatalog()`. Elle montre les offres personnelles et organisation, leurs prix, limites et promesses sans tableau parallèle codé en dur.

### `/billing`

Consomme le même catalogue et affiche séparément : offre appliquée, niveau, statut, messages/tokens, sources IA, documents métier et stockage.

### Console DTSC

La Console utilise la même projection avec `includeInactive: true` pour administrer et auditer l’ensemble du catalogue. Les modifications de `BillingPlan` continuent de créer une entrée `BillingPlanVersion` et restent auditées.

Une offre canonique ne peut pas changer silencieusement d’audience.

## Historique et versionnement

Billing Catalog v2 n’ajoute aucune migration Prisma. Il réutilise `BillingPlanVersion` et calcule une release publiée à partir de l’état administré courant.

Un abonnement existant référence toujours son `BillingPlan` actuel ; ce hotfix ne prétend donc pas introduire un mécanisme de grandfathering tarifaire par version d’abonnement qui n’existe pas dans le schéma courant. Une évolution future de ce comportement devra être additive et explicite.

## QA

`scripts/qa-billing-catalog-v2-checks.mjs`, intégré à `qa:regression`, vérifie notamment :

- les sept identités et valeurs bootstrap ;
- la présence du catalogue partagé ;
- l’absence d’écrasement `documents métier ← sources IA` ;
- appels/calendrier/administration en Essentiel actif ;
- IA Assistant Entreprise incluse à partir d’Essentiel ;
- `/tarifs`, `/billing` et Console alimentés par le catalogue ;
- CAG versionné par `releaseId` ;
- assistant public sans grille de prix parallèle ;
- chatbot général alimenté par le CAG commercial ;
- contexte IA Entreprise et distinction des limites ;
- modes outils Agent conformes à Essentielle/Croissance/Premium.

Avant merge, les preuves exigées par `docs/CONTRIBUTING.md` restent obligatoires : `git diff --check`, `pnpm prisma:generate`, `pnpm type-check`, QA ciblée, `pnpm qa:regression`, `pnpm lint`, `pnpm build`, puis OWNER_E2E pour les surfaces concernées. La CI GitHub fait foi lorsque l’environnement local ne permet pas leur exécution complète.
