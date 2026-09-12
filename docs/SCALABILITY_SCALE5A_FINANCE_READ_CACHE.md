# SCALE-5A — Tenant-scoped read cache et projection Finance Overview

## Objectif

SCALE-5A introduit un cache de lecture court pour les agrégats du module `FINANCE_OVERVIEW` sans changer la source de vérité. PostgreSQL reste l'autorité et le cache Redis REST n'est qu'une optimisation reconstructible.

## Contrat

```text
route autorisée
→ GET cache tenant-scoped borné
→ HIT: JSON validé
→ MISS: calcul PostgreSQL canonique + SET best-effort
→ Redis indisponible/lent/erreur: calcul PostgreSQL canonique
```

La réponse HTTP de `/finance/overview-summary` reste strictement le résumé Finance existant. La source technique `HIT | MISS | FALLBACK` n'est écrite que dans `ApiLog` et n'est pas exposée comme jargon utilisateur.

## Clés et isolation

Les clés suivent le contrat :

```text
dtsc:read-cache:<schemaVersion>:<projection>:org:<organizationId>
```

Le `organizationId` est obligatoire. Il n'existe aucune clé globale de données Finance partagée entre entreprises. La version de schéma rend un changement de contrat invalidant sans purge destructive.

## Fraîcheur

- projection pilote : `finance-overview-summary` ;
- version : `v1` ;
- TTL : 30 secondes ;
- timeout cache : 250 ms, volontairement inférieur au timeout Redis REST général ;
- JSON invalide : traité comme MISS, jamais comme vérité ;
- Redis indisponible : fallback PostgreSQL immédiat après le timeout borné.

## Invalidation

Le worker Workflow transporte désormais `organizationId` et `entityType` du `EnterpriseDomainEvent` claimé. Après traitement métier/workflow, les types d'entités qui peuvent modifier les compteurs Finance Overview invalident uniquement la clé de leur organisation.

L'invalidation Redis est best-effort : une panne Redis ne transforme jamais un événement métier traité en `FAILED` ou `DEAD`.

## Observabilité

Les compteurs Redis techniques distinguent `hit`, `miss`, fallback, JSON invalide et invalidation. Ils ne contiennent ni montant, payload métier, userId ni donnée cliente. Leur rétention est bornée.

## Sécurité

- autorisation `FINANCE_OVERVIEW` inchangée ;
- aucune donnée Finance n'est retournée avant le contrôle session/tenant/module/RBAC ;
- aucun secret Redis côté client ;
- aucun `NEXT_PUBLIC_*` Redis ;
- PostgreSQL reste la seule source canonique.

## QA

La gate permanente `qa-erp-stabilization-observability.mjs`, déjà incluse dans `qa:regression` via la QA comptable, vérifie :

- clé tenant-scoped et versionnée ;
- timeout court ;
- validation du JSON ;
- HIT/MISS/FALLBACK ;
- absence de Prisma dans le helper cache ;
- route Finance conservant l'autorisation et l'audit ;
- invalidation par organisation depuis le worker ;
- conservation des huit agrégats PostgreSQL canoniques comme fallback.

## OWNER_E2E

1. ouvrir deux fois successivement Finance Overview et vérifier la cohérence des métriques ;
2. effectuer une mutation Finance qui change l'un des compteurs ;
3. revenir au dashboard et vérifier le rafraîchissement dans la fenêtre de fraîcheur documentée ;
4. répéter sur une seconde organisation pour vérifier l'absence de pollution croisée.

`OWNER_E2E` reste `NOT_EXECUTED` tant qu'il n'est pas confirmé explicitement.

## Rollback

Le rollback applicatif retire l'appel au cache et revient au loader PostgreSQL. Les clés Redis sont éphémères et peuvent expirer naturellement ; aucune donnée métier ni migration n'est à restaurer.
