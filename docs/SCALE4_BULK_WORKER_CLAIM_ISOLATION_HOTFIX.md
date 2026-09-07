# SCALE-4 — Hotfix d’isolation des claims des workers

Issue : #587
Parent : #357
Baseline : `main@676e115661dd40c0ae8160c75799011ec37a0b6f`

## Cause racine

DTSC utilise une file durable partagée `EnterpriseDomainEvent`, mais chaque famille technique possède son worker propriétaire. Les crons Workflow et Enterprise Bulk s’exécutent tous les deux chaque minute.

Après SCALE-4F/G, trois nouveaux événements techniques Finance ont été ajoutés :

| Event type | Propriétaire |
|---|---|
| `FINANCE_BANK_STATEMENT_IMPORT_REQUESTED` | Enterprise Bulk worker |
| `ENTERPRISE_AUDIT_EXPORT_REQUESTED` | Enterprise Bulk worker |
| `FINANCE_REPORT_GENERATION_REQUESTED` | Enterprise Bulk worker |

Le worker workflow excluait déjà Web Push, email broadcast et knowledge indexing de son claim, mais pas ces trois événements. Un claim concurrent pouvait donc sélectionner un job bulk avant le worker Enterprise Bulk. Comme le moteur workflow ne réalise pas le traitement bulk, l’événement pouvait ensuite être marqué `PROCESSED` par le mauvais worker.

Le défaut est une race de routage prouvée par le code et les crons. Ce document ne prétend pas qu’une perte de données Production a effectivement eu lieu.

## Correction

Les deux chemins workflow sont corrigés :

- `lib/enterprise/workflows/worker.ts` ;
- `lib/enterprise/workflows/worker-isolated.ts`.

Leurs snapshots de queue (`ready`, `processing`, `dead`, `oldestReadyAgeMs`) et leur claim SQL excluent désormais explicitement les trois événements Enterprise Bulk Finance, en plus de :

- `PLATFORM_WEB_PUSH_NOTIFICATION` ;
- l’événement de livraison email broadcast ;
- l’événement d’indexation knowledge.

`FOR UPDATE SKIP LOCKED`, lease, backoff, retry et DLQ restent inchangés.

Le worker Enterprise Bulk conserve une allowlist positive des trois event types Finance. Il ne devient pas un worker générique.

## Matrice d’ownership durable

| Famille | Worker propriétaire | Worker workflow |
|---|---|---|
| événements métier workflow | Workflow | réclamés |
| projections inter-modules | Projection worker après matérialisation | non exécutées lourdement dans le worker isolé |
| Web Push | Web Push worker | exclu |
| broadcast email | Admin broadcast email worker | exclu |
| knowledge indexing | Knowledge worker | exclu |
| import relevé bancaire | Enterprise Bulk worker | exclu |
| export Audit | Enterprise Bulk worker | exclu |
| génération rapport Finance | Enterprise Bulk worker | exclu |

## Gate permanente

`scripts/qa-scale4-worker-claim-isolation.mjs` est importé par `scripts/qa-regression-checks.mjs`.

Le gate :

1. découvre les exports `*_EVENT_TYPE` de `lib/enterprise/bulk-jobs/constants.ts` ;
2. exige leur exclusion dans les quatre métriques et le claim des deux workers workflow ;
3. exige leur présence dans le worker Enterprise Bulk ;
4. préserve les frontières Push/email/knowledge ;
5. préserve `FOR UPDATE SKIP LOCKED` ;
6. interdit les event types techniques bulk dans `WORKFLOW_DOMAIN_EVENTS` ;
7. vérifie que les crons workflow et bulk concurrents restent couverts par ce contrat.

Ainsi, ajouter un nouveau type de job bulk sans mettre à jour la frontière workflow fait échouer la régression.

## Sécurité et données

Aucune donnée métier, aucun montant et aucun payload ne sont ajoutés aux logs. Aucun RBAC, entitlement, secret worker ou schéma Prisma n’est modifié.

Le hotfix réduit uniquement l’ensemble des événements que le worker workflow a le droit de réclamer.

## Rollback

Aucune migration n’existe dans ce hotfix.

Le rollback applicatif est un revert des exclusions. Toutefois, si un rollback est nécessaire en Production, il faut d’abord suspendre le cron workflow afin de ne pas réintroduire la course avec Enterprise Bulk pendant le diagnostic.

## Reprise SCALE-5

#586 reste bloquée jusqu’à fusion et validation Production de ce hotfix. Comme sa branche actuelle est basée sur le `main` antérieur au hotfix, elle devra être réappliquée depuis le nouveau `main` selon `docs/CONTRIBUTING.md`, et non fusionnée comme arbre historique.
