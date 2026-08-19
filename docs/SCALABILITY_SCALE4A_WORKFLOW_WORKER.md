# SCALE-4A — Cadence du worker workflow et pression de file

Parent : #357  
Programme : #352  
Issue : #438

## Objectif

Cette itération fait avancer SCALE-4 sans introduire une nouvelle infrastructure de queue. DTSC Platform possède déjà une file durable basée sur `EnterpriseDomainEvent`, un worker idempotent, des leases, `FOR UPDATE SKIP LOCKED`, des retries et un état terminal `DEAD`.

Le problème traité ici est la latence de scheduling et l'absence de signal simple sur la pression de file : avant SCALE-4A, le cron Vercel invoquait le worker toutes les cinq minutes avec un lot maximum de 20 événements.

## Contrat livré

- la source durable reste `EnterpriseDomainEvent` ;
- le batch maximum reste 20 ;
- le cron passe de `*/5 * * * *` à `* * * * *` ;
- la route interne reste bornée à 60 secondes ;
- Vercel Cron continue d'utiliser `CRON_SECRET` et le secret dédié `WORKFLOW_WORKER_SECRET` reste accepté pour l'exploitation contrôlée ;
- la réclamation reste atomique avec lease et `FOR UPDATE SKIP LOCKED` ;
- les événements restent traités séquentiellement dans ce sous-lot afin de ne pas introduire de concurrence métier non prouvée ;
- les retries/backoff et le passage terminal `DEAD` restent inchangés.

## Pression de file

Chaque invocation collecte un snapshot technique avant et après traitement :

- `ready` : événements `PENDING`/`FAILED` disponibles et non couverts par une lease active ;
- `processing` : événements `PROCESSING` couverts par une lease active ;
- `dead` : événements terminaux à examiner ;
- `oldestReadyAgeMs` : âge du plus ancien événement prêt ;
- `sampledAt` : horodatage du snapshot.

Aucun snapshot ne contient de payload métier, `organizationId`, utilisateur, contenu ERP ou secret.

Si le snapshot échoue, il devient `available=false` sans transformer une mesure d'observabilité en seconde condition d'échec du worker.

## Signal de saturation

`saturated=true` lorsque :

1. le worker réclame le batch maximum ;
2. le snapshot après traitement est disponible ;
3. il reste au moins un événement prêt.

Ce signal permet de prouver un backlog avant d'augmenter le batch, d'introduire une concurrence bornée ou de séparer des familles de workers dans les lots SCALE-4 suivants.

## Overlap et multi-instance

Une cadence à la minute peut faire démarrer une nouvelle invocation alors qu'une précédente approche sa limite. Le contrat existant empêche une double réclamation normale :

- les lignes sont réclamées avec `FOR UPDATE SKIP LOCKED` ;
- une lease (`lockedAt`, `lockedBy`) protège les événements en cours ;
- une lease expirée redevient récupérable selon le contrat existant ;
- la Function reste bornée à 60 secondes et la lease à 90 secondes.

SCALE-4A ne modifie pas ces primitives.

## Capacité structurelle

Le changement de cadence fait passer la capacité théorique de scheduling de 20 événements toutes les cinq minutes à 20 événements par minute, soit un facteur 5, sans modifier la taille du lot ni paralléliser les transitions métier.

Cette valeur est un plafond de prise en charge théorique, pas une certification de débit Production. Les mesures de backlog/latence doivent guider les lots suivants.

## QA

La gate `scripts/qa-scale4a-workflow-worker.mjs` vérifie notamment :

- cadence cron à une minute ;
- batch conservé à 20 ;
- `FOR UPDATE SKIP LOCKED` et lease ;
- snapshots avant/après ;
- signal de saturation ;
- retry/DLQ ;
- absence de parallélisation aveugle ;
- `maxDuration=60` ;
- secrets worker/cron ;
- exposition des métriques dans la route interne.

Elle est intégrée à Regression QA.

## Hors scope

Restent sous #357 :

- séparation de workers par domaine/coût ;
- notifications lourdes ;
- imports/exports ;
- génération de rapports lourds ;
- indexation IA ;
- concurrence bornée prouvée ;
- DLQ opérable et alerting avancé ;
- tests crash/retry à charge représentative.

## Rollback

Rollback applicatif simple :

1. remettre le cron à `*/5 * * * *` ;
2. retirer les snapshots/signal de saturation si nécessaire ;
3. conserver la file durable et les états déjà persistés.

Aucune migration, aucun backfill et aucune restauration de donnée ne sont requis.
