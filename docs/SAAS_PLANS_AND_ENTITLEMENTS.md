# Offres SaaS, niveaux de capacité et entitlements

Dernière mise à jour : 11 août 2026

Ce document décrit la logique SaaS active pour les comptes personnels et les organisations clientes DTSC Platform. Il sépare volontairement le catalogue commercial, les abonnements et les niveaux techniques de capacité.

## Vocabulaire canonique

### Offre commerciale

Une **offre** est une ligne `BillingPlan`. Elle porte le nom commercial, l'audience (`PERSONAL`, `ORGANIZATION` ou `BOTH`), le prix, les quotas IA et la capacité documentaire.

Exemples actuels :

- offres personnelles : `Découverte`, `Individuel Essentiel`, `Individuel Professionnel`, `Individuel Premium` ;
- offres organisation : `Organisation Essentielle`, `Organisation Croissance`, `Organisation Premium`.

`config/billing-plans.bootstrap.json` initialise uniquement les offres absentes. Une fois la ligne créée, `BillingPlan` en base est la source commerciale administrable ; `ensureBillingPlans()` utilise `createMany(..., skipDuplicates: true)` et n'écrase pas les valeurs administrées.

### Abonnement

Un **abonnement** relie un bénéficiaire à une offre :

- `Subscription` pour le compte personnel ;
- `OrganizationSubscription` pour une organisation cliente.

Le statut, la période, l'essai et l'expiration appartiennent à l'abonnement, pas à l'offre.

### Niveau de capacité

Le **niveau de capacité** est dérivé de l'offre par `lib/billing/plans.ts` :

- `STARTER` → **Essentiel** ;
- `BUSINESS` → **Professionnel** ;
- `ENTERPRISE` → **Entreprise**.

Ces codes techniques pilotent les exigences de modules, les modèles IA et les limites générales. Ils ne doivent pas être présentés au client comme le nom de son offre commerciale.

## Résolution canonique du contexte commercial

`lib/billing/commercial-context.ts` est l'autorité de résolution entre offre, abonnement et niveau de capacité.

### Organisation cliente

Le contexte organisation utilise exclusivement `OrganizationSubscription`. Il ne retombe jamais sur l'abonnement personnel ou l'offre freemium d'un membre pour déterminer les quotas IA ou le niveau commercial de l'entreprise.

Le resolver accepte les offres `ORGANIZATION` ou `BOTH`. Pour la compatibilité de lecture avant/après migration, les références historiques suivantes sont reconnues :

- `freemium` / `starter` → `org-starter` ;
- `growth` → `org-growth` ;
- `premium` → `org-premium`.

La migration `20260811103500_reconcile_organization_billing_plan_audience` crée les offres organisation manquantes sans écraser les valeurs existantes, normalise leur audience et remappe les `OrganizationSubscription` historiques. Les factures et paiements historiques ne sont pas réécrits.

Si aucune offre organisation valide n'est résolue, le contexte reste sur une baseline restrictive : aucune limite IA personnelle n'est empruntée silencieusement.

### Compte personnel

Le contexte personnel utilise :

1. un `Subscription` actif et encore dans sa période ;
2. sinon l'offre `freemium` active ;
3. sinon, uniquement en compatibilité historique, `User.dailyMessageLimit` et `User.dailyTokenLimit`.

### DTSC interne

`DTSC_INTERNAL` garde le niveau `ENTERPRISE`. Les quotas messages/tokens des collaborateurs DTSC sont les limites administrées par membre dans la Console ; elles ne sont pas un abonnement client.

## Limites

`lib/billing/plan-limits.ts` définit les limites générales par niveau : utilisateurs, stockage, appels, modules, documents, IA et support.

Les quotas commerciaux propres à une offre (`dailyMessageLimit`, `dailyTokenLimit`, `maxDocuments`) sont projetés dans :

- `lib/billing/entitlements.ts` pour les capacités organisation ;
- `lib/billing/ai-usage-limits.ts` pour le runtime IA.

Les deux couches utilisent le même resolver commercial et ne maintiennent plus deux lectures concurrentes de l'abonnement organisation.

## Entitlements

`lib/billing/entitlements.ts` expose :

- `getOrganizationEntitlements(organizationId)` ;
- `canUseModule(organizationId, moduleCode)` ;
- `canUseFeature(organizationId, feature)` ;
- `assertCanUseModule(organizationId, moduleCode)` ;
- `getOrganizationUsageLimits(organizationId)` ;
- `isSubscriptionActive(subscription)`.

Les décisions tiennent compte du statut de l'organisation, du statut/période d'abonnement, du niveau de capacité, des modules configurés et de leurs exigences.

## Règles d'accès

- Le tenant interne DTSC conserve son accès via `DTSC_INTERNAL`.
- Une organisation active sans abonnement actif garde uniquement les fonctionnalités explicitement prévues sans abonnement actif ; elle n'hérite jamais du compte personnel d'un membre.
- Les modules Business/Professionnel ou Enterprise/Entreprise exigent un abonnement ou essai valide lorsque leur contrat l'impose.
- Une organisation suspendue est restreinte avec message explicite ; le support reste disponible selon son entitlement.
- Les routes serveur restent l'autorité : masquer un bouton côté UI ne suffit jamais.

## Modules contrôlés

Les droits de fonctionnalités sont déclarés dans `lib/billing/module-entitlements.ts` :

- `support` : Essentiel, sans abonnement actif requis ;
- `collaborators` : Essentiel, sans abonnement actif requis ;
- `collaboration-calls` : Professionnel avec abonnement actif ;
- `calendar` : Professionnel avec abonnement actif ;
- `enterprise-admin` : Professionnel avec abonnement actif ;
- `enterprise-activities` : Professionnel avec abonnement actif ;
- `enterprise-workflows` : Professionnel avec abonnement actif ;
- `healthcare` : Entreprise avec abonnement actif.

Les modules sectoriels santé avancés exigent le niveau Entreprise selon le registre canonique.

## Interface Abonnement

`/billing` distingue maintenant explicitement :

- **Offre appliquée** ;
- **Niveau de capacité** ;
- **Statut** ;
- quotas du contexte actif ;
- abonnement personnel ;
- abonnement de l'organisation active ;
- factures et paiements SaaS.

Les quotas affichés en contexte organisation proviennent de l'offre organisation résolue, jamais de l'offre personnelle visible dans le bloc « Abonnement personnel ».

## IA et CAG

Le runtime IA reçoit le niveau technique pour le routage mais le CAG expose séparément :

- l'**offre commerciale** ;
- le **niveau de capacité** ;
- le **statut d'abonnement**.

Le texte ambigu `Plan: STARTER|BUSINESS|ENTERPRISE` n'est plus utilisé comme identité commerciale du client.

## Console DTSC

La section `Abonnements & facturation` de l'administration DTSC reste le centre de contrôle des abonnements organisations. Les routes de création et modification revalident que l'offre choisie a une audience `ORGANIZATION` ou `BOTH`, conservent les contrôles `DTSC_INTERNAL`, same-origin, rate limit, Zod et audit.

Les identifiants et slugs d'offres restent immuables pour préserver les abonnements, factures et mappings. Une offre inactive reste historique mais n'est plus proposée pour une nouvelle souscription.

## Séparation ERP

Les paiements et factures SaaS restent distincts des ventes, achats, factures clients/fournisseurs et écritures comptables ERP.

## QA

Les gates Standard Subscription et Standard AI vérifient notamment :

- présence du resolver commercial canonique ;
- absence de fallback organisation → abonnement personnel dans les limites IA ;
- mapping historique vers `org-starter`, `org-growth`, `org-premium` ;
- cohérence de l'interface Abonnement ;
- terminologie CAG « offre commerciale » / « niveau de capacité » ;
- migration idempotente de réconciliation ;
- maintien de l'isolation `DTSC_INTERNAL` / `CLIENT`.

Avant merge : `git diff --check`, migrations sur base propre, `pnpm type-check`, QA ciblées, `pnpm qa:regression`, `pnpm lint` et `pnpm build` doivent être verts, la CI GitHub faisant foi lorsqu'un environnement local complet n'est pas disponible.
