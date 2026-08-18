# SCALE-3A — Distributed rate limiter primitive

Issue: #427
Parent: #356
Programme: #352

## Objectif

SCALE-3A durcit le primitive partagé `lib/rate-limit.ts` sans modifier encore la politique métier de chaque route. Le contrat historique `rateLimit(key, limit, windowMs)` reste compatible ; les routes pourront adopter progressivement une politique de panne explicite dans les sous-lots suivants de SCALE-3.

## Diagnostic remboursé

Avant SCALE-3A :

- `lib/rate-limit.ts` ouvrait son propre `fetch()` Upstash sans timeout ;
- la fenêtre Redis était créée avec `INCR`, puis `PEXPIRE` dans une deuxième requête ;
- un succès `INCR` suivi d'un échec `PEXPIRE` pouvait laisser une clé persistante ;
- la première requête d'une fenêtre consommait deux roundtrips ;
- l'échec Redis basculait silencieusement sur un `Map` local ;
- la clé Redis conservait une représentation lisible du matériau de clé, y compris l'IP lorsque `getRateLimitKey()` était utilisé ;
- le `Map` local n'avait pas de limite de cardinalité.

## Contrat distribué

Le primitive réutilise désormais `lib/redis-rest.ts` et son contrat serveur-only. Le rate limiter impose une borne plus stricte :

- `RATE_LIMIT_REDIS_TIMEOUT_MS = 300` ms maximum ;
- un appelant peut demander une borne plus faible, jamais une borne supérieure ;
- les absences de configuration, timeouts et erreurs Redis sont retournés comme raisons contrôlées, sans log provider brut.

### Opération atomique

Un seul `EVAL` Redis exécute, dans la même opération :

1. `INCR` ;
2. `PTTL` ;
3. `PEXPIRE` si la clé vient d'être créée ou si une ancienne clé sans TTL est rencontrée ;
4. retour `{ count, ttlMs }`.

La fenêtre ne dépend donc plus d'un deuxième roundtrip applicatif pour recevoir son expiration.

## Clés anonymisées

Le matériau complet fourni à `rateLimit()` est transformé par SHA-256 avant stockage :

```text
dtsc:rl:v2:<sha256>
```

L'IP, l'utilisateur, le tenant ou l'action éventuellement présents dans la clé logique ne sont pas écrits en clair dans Redis ni dans le fallback local.

## Dégradation explicite

`RateLimitOptions.failureMode` accepte :

- `local` — valeur par défaut, compatibilité historique : fallback sur un bucket local par instance ;
- `open` — autorise la requête en état dégradé ;
- `closed` — refuse la requête en état dégradé.

Le résultat conserve :

- `ok` ;
- `remaining` ;
- `resetAt`.

Il ajoute :

- `source`: `redis | local | fail-open | fail-closed` ;
- `degraded` ;
- `reason`: `UNCONFIGURED | TIMEOUT | ERROR | null`.

Le choix `open/closed` ne doit pas être appliqué arbitrairement. La classification route-par-route reste un travail du parent #356.

## Fallback local borné

Le fallback `Map` reste disponible pour préserver le comportement existant, mais sa cardinalité est bornée à 10 000 buckets. Lorsque la limite est atteinte :

1. les buckets expirés sont purgés ;
2. si nécessaire, le plus ancien bucket restant est évincé avant insertion.

Ce fallback reste explicitement `degraded=true` et ne prétend jamais être un contrôle distribué multi-instance.

## Sécurité et données

- aucune nouvelle variable d'environnement ;
- aucune variable Redis publique ;
- aucun secret ou objet d'erreur provider loggé ;
- aucune migration Prisma ;
- aucune donnée durable modifiée ;
- le multi-instance reste assuré par Redis lorsque disponible.

## Validation attendue

La gate `scripts/qa-scale3a-distributed-rate-limit.mjs` vérifie notamment :

- réutilisation de `lib/redis-rest.ts` ;
- absence de `fetch()` direct dans le limiter ;
- timeout rate-limit strictement inférieur au timeout Redis générique ;
- opération unique `EVAL` avec `INCR`, `PTTL`, `PEXPIRE` ;
- SHA-256 et namespace v2 ;
- modes `local/open/closed` ;
- résultat enrichi sans suppression du contrat historique ;
- fallback local borné ;
- branchement dans Regression QA.

## Hors scope / suite #356

SCALE-3 ne pourra fermer qu'après :

- classification des routes sensibles entre `local`, `open` et `closed` ;
- métriques/observabilité de fallback adaptées au contexte distribué ;
- tests multi-instance et panne Redis ;
- preuve de charge/failover démontrant qu'aucune route interactive n'attend Redis trop longtemps.

Ces éléments ne sont pas considérés comme livrés par SCALE-3A.

## Rollback

Un revert applicatif de #427 restaure le primitive antérieur. Aucune restauration de schéma, migration, donnée durable ou backfill n'est nécessaire.
