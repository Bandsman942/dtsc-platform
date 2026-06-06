# Plans SaaS et entitlements

Derniere mise a jour: 6 juin 2026

Ce document decrit la logique SaaS active pour les organisations clientes DTSC Platform. Elle centralise les plans, les limites, les modules autorises et les controles serveur sans migration destructive.

## Plans

La source de verite des niveaux SaaS est dans `lib/billing/plans.ts`.

- `STARTER`: socle d'acces organisation avec support, collaboration lisible et modules de base.
- `BUSINESS`: administration entreprise, activites, workflows, calendrier interne et appels collaboratifs.
- `ENTERPRISE`: modules sectoriels avances, notamment les modules sante `HEALTH_CARE`, reporting et limites elevees.

Les anciens slugs de plans chatbot (`freemium`, `starter`, `growth`, `premium`) sont mappes vers ces niveaux pour conserver la compatibilite avec les donnees existantes.

## Limites

Les limites d'usage organisation sont dans `lib/billing/plan-limits.ts`:

- utilisateurs maximum;
- stockage maximum;
- minutes d'appels mensuelles;
- modules actifs maximum;
- documents maximum;
- niveau de support.

Ces limites sont affichees dans la Console DTSC et dans la page client `/billing`. Elles ne remplacent pas les validations metier existantes; elles fournissent le cadre unique pour les controles progressifs.

## Entitlements

`lib/billing/entitlements.ts` expose:

- `getOrganizationEntitlements(organizationId)`;
- `canUseModule(organizationId, moduleCode)`;
- `canUseFeature(organizationId, feature)`;
- `assertCanUseModule(organizationId, moduleCode)`;
- `getOrganizationUsageLimits(organizationId)`;
- `isSubscriptionActive(subscription)`.

Les decisions tiennent compte du statut organisation, du statut d'abonnement, des dates d'essai/expiration, du plan resolu, des modules actives et des exigences de plan.

## Regles d'acces

- Le tenant interne DTSC conserve un acces complet via `DTSC_INTERNAL`.
- Une organisation active sans abonnement actif garde un acces minimal lisible: support et collaboration de base selon les droits existants.
- Les modules Business ou Enterprise exigent un abonnement actif ou une periode d'essai valide.
- Une organisation suspendue est restreinte avec message explicite; le support reste disponible pour regularisation.
- Les routes serveur restent l'autorite: masquer un bouton cote UI ne suffit jamais.

## Modules controles

Les droits de modules sont declares dans `lib/billing/module-entitlements.ts`.

- `support`: Starter, sans abonnement actif requis.
- `collaborators`: Starter, sans abonnement actif requis.
- `collaboration-calls`: Business avec abonnement actif.
- `calendar`: Business avec abonnement actif.
- `enterprise-admin`: Business avec abonnement actif.
- `enterprise-activities`: Business avec abonnement actif.
- `enterprise-workflows`: Business avec abonnement actif.
- `healthcare`: Enterprise avec abonnement actif.

Les modules sectoriels sante (`PATIENTS`, `APPOINTMENTS`, `CONSULTATIONS`, `LABORATORY`, `MEDICAL_BILLING`, `HEALTH_REPORTS`, etc.) exigent Enterprise.

## Routes et ecrans renforces

- `/enterprise-admin`: affiche un panneau clair si le plan ou l'abonnement ne permet pas l'administration.
- `/enterprise-activities`: meme logique d'acces lisible, avec filtrage des blocs par module autorise.
- `/calendar` et routes `/api/calendar/*`: controle `calendar` cote serveur.
- `/collaborators` et routes groupes/appels: controle `collaborators` et `collaboration-calls`.
- Routes sante Enterprise: elles reutilisent `canAccessEnterpriseModule`, lui-meme branche sur `canUseModule`.
- `/api/enterprise/[organizationId]/modules/[moduleId]`: l'activation d'un module hors plan est refusee cote serveur.
- `/api/admin/client-organizations/*`: creation et modification reservees au contexte `DTSC_INTERNAL`, avec origine, rate limit et validation Zod.
- `/api/billing/checkout`: origine, rate limit, validation Zod et maintenance MaishaPay explicite.

## Console DTSC

La section `Abonnements & facturation` de `/admin` affiche maintenant les abonnements organisations avec:

- organisation, slug, statut;
- plan SaaS resolu;
- statut abonnement, dates d'essai, debut et renouvellement;
- utilisateurs actifs;
- modules actives et limites;
- limites utilisateurs, stockage, documents et appels;
- dernier enregistrement de facturation organisation;
- audit des paiements utilisateur existant.

Elle constitue aussi le centre de controle DTSC des abonnements:

- creation d'un abonnement pour une entreprise sans periode courante;
- modification du plan, statut et des dates;
- activation, essai, suspension, retard de paiement, expiration et annulation;
- renouvellement avec cloture de la periode courante et creation d'une nouvelle periode;
- consultation de l'historique complet par entreprise;
- motif obligatoire, `ApiLog` et `AuditLog` pour chaque mutation.

La suppression physique n'est pas exposee. L'operation de suppression fonctionnelle est une annulation metier (`CANCELED`) qui conserve les paiements, l'historique et les preuves d'audit.

### Administration des plans et tarifs

Le bloc `Plans et tarifs` de `/admin?section=billing` affiche tous les plans, y compris les plans inactifs, et permet au role `ADMIN` de modifier:

- nom commercial et description;
- prix mensuel USD, avec deux decimales maximum;
- quotas chatbot: messages, tokens et documents;
- ordre d'affichage et activation.

Les identifiants et slugs restent immuables pour préserver les abonnements, factures et mappings SaaS. Le plan `freemium` doit rester actif et gratuit. Un plan inactif reste visible dans l'historique mais n'est plus propose pour les nouveaux abonnements.

`ensureBillingPlans()` initialise uniquement les plans absents avec `createMany(..., skipDuplicates: true)`. Les chargements de `/billing`, le checkout et l'inscription ne peuvent donc plus ecraser les tarifs administres.

### API de controle DTSC

| Methode | Route | Acces | Payload principal | Reponse |
| --- | --- | --- | --- | --- |
| `POST` | `/api/admin/organization-subscriptions` | session `DTSC_INTERNAL`, role `ADMIN` ou `MANAGER` | `organizationId`, `planId`, `status`, dates optionnelles, `reason` | `{ ok, subscriptionId }` |
| `PATCH` | `/api/admin/organization-subscriptions/[id]` | session `DTSC_INTERNAL`, role `ADMIN` ou `MANAGER` | `action`, plan/statut/dates selon action, `reason` | `{ ok, subscriptionId }` |
| `PATCH` | `/api/admin/billing-plans/[id]` | session `DTSC_INTERNAL`, role `ADMIN` | `name`, `description`, `priceUsd`, quotas, `sortOrder`, `isActive`, `reason` | `{ ok, planId }` |

Actions `PATCH`: `update`, `activate`, `start_trial`, `renew`, `suspend`, `mark_past_due`, `cancel`, `expire`.

Les deux routes exigent une origine valide, appliquent un rate limit, valident avec Zod et journalisent les acces et mutations. Elles ne necessitent aucune variable d'environnement supplementaire.

Les clients voient leur statut organisation, limites, modules et derniers enregistrements de facturation dans `/billing`, sans action de modification autonome.

## MaishaPay

Le checkout MaishaPay existant reste celui des abonnements utilisateur chatbot. Aucune integration parallele organisationnelle n'a ete ajoutee. Les paiements organisation peuvent etre suivis via `BillingRecord`; leur creation et reconciliation restent gerees cote DTSC tant qu'un flux MaishaPay organisation dedie n'est pas implemente.

## QA

`scripts/qa-regression-checks.mjs` verifie les invariants source-level:

- presence des plans, limites et entitlements centralises;
- controle des modules Enterprise, sante, calendrier, collaboration et appels;
- Console DTSC abonnee aux datasets organisation;
- routes organisations et checkout protegees par origine, rate limit et Zod.
- CRUD metier des abonnements protege par contexte DTSC, origine, rate limit, Zod et audit.
- initialisation des plans non destructive et administration tarifaire reservee au role `ADMIN`.

Executer avant commit/push:

```bash
pnpm qa:regression
pnpm type-check
pnpm lint
pnpm build
git diff --check
git diff --cached --check
```

Si `pnpm` est absent, executer `node scripts/qa-regression-checks.mjs` avec le Node disponible et documenter les controles impossibles localement.
