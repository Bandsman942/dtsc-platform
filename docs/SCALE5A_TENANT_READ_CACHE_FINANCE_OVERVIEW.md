# SCALE-5A — Tenant-scoped read cache / Finance Overview

Issue : #586  
Parent : #358  
Programme : #352

## Objectif

Réduire la pression PostgreSQL des lectures répétées du dashboard Finance Overview sans créer de seconde vérité métier.

PostgreSQL reste la source canonique. Redis ne contient qu'une projection JSON éphémère, reconstructible et supprimable à tout moment.

## Flux de lecture

`RBAC/session/tenant → Redis GET borné → HIT: JSON validé → réponse`

`RBAC/session/tenant → MISS/FALLBACK → 8 COUNT PostgreSQL canoniques → SETEX best-effort → réponse`

Le contrat JSON retourné par la route est inchangé.

## Clé et isolation tenant

La clé est versionnée par projection et schéma, et l'identifiant d'organisation n'est jamais exposé en clair :

`dtsc:read-cache:<schema>:<namespace>:org:<sha256-tenant>`

Le digest est déterministe par organisation. Deux organisations distinctes ne peuvent donc pas partager la même clé applicative.

## Fraîcheur et latence

- timeout read-cache : 120 ms ;
- timeout Redis REST générique : 750 ms ;
- TTL Finance Overview : 15 s ;
- plafond générique de TTL : 5 min ;
- HIT : un seul `GET` Redis, aucun COUNT PostgreSQL ;
- MISS : loader PostgreSQL canonique puis `SETEX` best-effort ;
- Redis absent, timeout ou erreur : fallback PostgreSQL immédiat après le budget cache.

La télémétrie HIT/MISS/FALLBACK passe par `writeApiLog` de la route existante ; aucun second appel Redis n'est ajouté pour compter les hits.

## Validation du contenu cache

Un JSON Redis n'est jamais accepté par simple parsing. Le payload doit satisfaire le validateur structurel `EnterpriseFinanceOverviewSummary` : compteurs entiers positifs ou nuls et cohérence `invoicesToPost = sales + suppliers`.

Un cache invalide est traité comme un MISS et remplacé par le résultat canonique après recalcul.

## Invalidation événementielle

Les workers Workflow courant et isolé collectent uniquement les événements effectivement passés à `PROCESSED`, puis invalident en batch les clés Finance Overview des organisations concernées.

Familles couvertes : factures client/fournisseur et avoirs, paiements, sessions de caisse, rapprochements, écritures, clôture/périodes financières, validations, budgets, dépenses et factures sectorielles Health/Pharmacy qui convergent vers Finance.

L'invalidation est exécutée après le settlement métier et entourée d'un fallback best-effort. Une panne Redis ne peut donc pas remettre un événement métier en FAILED/DEAD.

Le TTL de 15 s constitue le filet de fraîcheur si une invalidation n'aboutit pas.

## Compatibilité SCALE-4

La correction #587/#588 reste intacte : le worker Workflow continue d'exclure Web Push, email, knowledge indexing et les trois jobs Bulk Finance. Les claims conservent `FOR UPDATE SKIP LOCKED`.

## Sécurité

- aucun `NEXT_PUBLIC_*` Redis ;
- aucun montant ni payload Finance dans les clés ou la télémétrie cache ;
- autorisation `FINANCE_OVERVIEW/view` conservée avant toute lecture cache ;
- Redis n'autorise jamais l'accès : il ne sert qu'après validation session/tenant/RBAC ;
- aucune donnée d'une organisation n'est recherchée avec la clé d'une autre.

## Observabilité

La route journalise uniquement des métadonnées techniques de lecture :
- `readSource` ;
- `cacheLookupMs` ;
- `dbLoaderMs` ;
- `cacheWriteAvailable` ;
- `redisReason`.

Le résultat d'invalidation du worker expose uniquement le nombre de clés tentées et la disponibilité Redis.

## Prisma

Aucune migration et aucun nouveau modèle. `EnterpriseCrossModuleProjection` reste un reçu de consommation inter-modules, pas un read-model de dashboard.

## Rollback

Retirer l'appel `getEnterpriseFinanceOverviewSummaryCached` et revenir au loader PostgreSQL canonique. Les clés Redis expirent naturellement ; aucun rollback de données n'est requis.

Ne jamais rendre Redis obligatoire pour restaurer le service : le fallback PostgreSQL fait partie du contrat de sûreté.

## QA permanente

`scripts/qa-scale5a-read-cache.mjs`, importé par `scripts/qa-regression-checks.mjs`, protège isolation tenant, budget de timeout, TTL, validation JSON, fallback DB, 8 COUNT canoniques, RBAC/JSON de route, invalidation post-settlement et conservation de l'ownership SCALE-4.
