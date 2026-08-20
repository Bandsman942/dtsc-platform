# SCALE-4B — isolation du worker de projections inter-modules

Parent : #357
Programme : #352
Issue : #445

## Objectif

SCALE-4B retire l'exécution des projections inter-modules du budget du worker workflow principal. La source métier reste `EnterpriseDomainEvent`; les projections attendues sont matérialisées de façon idempotente dans `EnterpriseCrossModuleProjection`, puis exécutées par un worker interne dédié.

## Avant SCALE-4B

Le worker workflow exécutait successivement les projections d'un événement, le workflow métier, puis un backlog de projections en fin de lot. Une projection lente pouvait donc consommer une part importante des 60 secondes disponibles et retarder des événements sans rapport.

## Contrat livré

- `EnterpriseDomainEvent` reste la source durable des événements métier ;
- le worker workflow ne fait plus qu'enqueue les projections attendues via `enqueueCrossModuleProjections` ;
- l'enqueue utilise la contrainte unique `(organizationId, domainEventId, consumerCode)` et reste idempotent ;
- la route workflow bascule vers `worker-isolated.ts` ;
- les projections sont exécutées par `/api/internal/cross-module-projections/process` ;
- le cron projection tourne chaque minute avec un batch maximum de 20 ;
- `CRON_SECRET` reste accepté pour Vercel Cron et `CROSS_MODULE_PROJECTION_WORKER_SECRET` permet une exploitation contrôlée séparée ;
- la Function projection reste bornée à 60 secondes ;
- aucune migration ni nouvelle table n'est introduite.

## Résilience

Le moteur de projection existant conserve :

- claim atomique via `updateMany` ;
- état `PROCESSING` ;
- récupération d'un traitement stale après cinq minutes ;
- compteur de tentatives ;
- retries avec backoff ;
- état terminal `DEAD` ;
- transactions sérialisables pour les projecteurs ;
- idempotence des liens inter-modules.

## Observabilité

Le worker projection expose uniquement des métriques techniques :

- `ready` ;
- `processing` ;
- `dead` ;
- `oldestReadyAgeMs` ;
- `queueBefore` / `queueAfter` ;
- `saturated` si un lot complet est réellement traité et qu'un backlog prêt subsiste.

Les objets projection complets, payloads métier, `organizationId`, identités utilisateur et contenus cliniques/ERP ne sont pas retournés par la route interne.

## Capacité

SCALE-4B ne revendique pas une augmentation arbitraire du batch. Il crée deux budgets d'exécution indépendants : un pour les workflows et un pour les projections. Le gain attendu est donc une réduction de la contention entre familles de travaux, à mesurer avant tout tuning de concurrence.

## QA

`scripts/qa-scale4b-projection-worker.mjs` protège :

- le cron projection à une minute ;
- le batch maximum de 20 ;
- le branchement de la route workflow vers le worker isolé ;
- l'absence d'exécution lourde de projection dans ce worker ;
- l'idempotence de l'enqueue ;
- les retries/DLQ/stale recovery existants ;
- le secret dédié ;
- les snapshots de pression et le signal de saturation ;
- la non-exposition des objets projection complets.

## Hors scope

Restent dans #357 : notifications lourdes, imports/exports, rapports lourds, indexation IA, séparation de nouvelles familles de workers et concurrence bornée prouvée.

## Rollback

Rollback applicatif :

1. rebrancher `/api/internal/workflows/process` sur le worker historique ;
2. retirer le cron projection dédié ;
3. conserver les lignes `EnterpriseCrossModuleProjection` déjà matérialisées ;
4. laisser le worker historique reprendre leur traitement.

Aucune restauration de donnée ni migration n'est nécessaire.
